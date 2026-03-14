"""
Discovery API Router
Device discovery, approval, blocking, and provisioning endpoints
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from uuid import UUID
from datetime import datetime
import json
import os

from database import get_db, DeviceDB, BlockedDeviceDB, DeviceProvisionDB
from models import (
    Device, DeviceStatus,
    DeviceDiscover, DeviceApproval, DeviceProvisionResponse,
    BlockedDeviceResponse, BlockDeviceRequest,
)
from state_manager import state_manager

router = APIRouter(tags=["discovery"])


# =============================================================================
# Helpers
# =============================================================================

def device_db_to_response(db_device: DeviceDB) -> Device:
    """Convert database model to response model"""
    return Device(
        id=db_device.id,
        name=db_device.name,
        device_type=db_device.device_type,
        hardware_id=db_device.hardware_id,
        firmware_version=db_device.firmware_version,
        ip_address=db_device.ip_address,
        location=db_device.location,
        metadata=db_device.device_metadata,
        status=db_device.status,
        last_seen=db_device.last_seen,
        created_at=db_device.created_at or datetime.utcnow(),
        updated_at=db_device.updated_at or datetime.utcnow(),
    )


async def _broadcast_discovery_event(event_type: str, data: dict):
    """Broadcast discovery events to NATS and MQTT"""
    event = {
        "type": f"device_{event_type}",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **data,
    }
    payload = json.dumps(event).encode()
    subject = f"maestra.device.{event_type}"

    # Publish to NATS
    if state_manager.nc and not state_manager.nc.is_closed:
        try:
            await state_manager.nc.publish(subject, payload)
        except Exception:
            pass

    # Publish to MQTT
    if state_manager.mqtt_client and state_manager.mqtt_client.is_connected():
        try:
            mqtt_topic = subject.replace(".", "/")
            state_manager.mqtt_client.publish(mqtt_topic, payload)
        except Exception:
            pass


# =============================================================================
# Device Discovery
# =============================================================================

@router.post("/devices/discover", response_model=Device)
async def discover_device(
    device: DeviceDiscover,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a discovered device as pending.
    Called by the discovery service when a new device is found via mDNS.
    Idempotent: returns existing device if hardware_id already registered.
    """
    # Check if hardware_id is blocked
    blocked = await db.execute(
        select(BlockedDeviceDB).where(BlockedDeviceDB.hardware_id == device.hardware_id)
    )
    if blocked.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Device hardware_id is blocked")

    # Check if device already exists
    existing = await db.execute(
        select(DeviceDB).where(DeviceDB.hardware_id == device.hardware_id)
    )
    existing_device = existing.scalar_one_or_none()
    if existing_device:
        # Update IP if it changed
        if device.ip_address and device.ip_address != existing_device.ip_address:
            existing_device.ip_address = device.ip_address
            existing_device.last_seen = datetime.utcnow()
            await db.commit()
            await db.refresh(existing_device)
        return device_db_to_response(existing_device)

    # Create new pending device
    new_device = DeviceDB(
        name=device.name,
        device_type=device.device_type,
        hardware_id=device.hardware_id,
        firmware_version=device.firmware_version,
        ip_address=device.ip_address,
        device_metadata=device.metadata or {},
        status=DeviceStatus.PENDING,
        last_seen=datetime.utcnow(),
    )
    db.add(new_device)
    await db.flush()

    # Create provisioning record
    provision = DeviceProvisionDB(
        device_id=new_device.id,
        provision_status="pending",
    )
    db.add(provision)
    await db.commit()
    await db.refresh(new_device)

    # Broadcast discovery event
    await _broadcast_discovery_event("discovered", {
        "device_id": str(new_device.id),
        "hardware_id": device.hardware_id,
        "name": device.name,
        "device_type": device.device_type,
        "ip_address": device.ip_address,
    })

    return device_db_to_response(new_device)


# =============================================================================
# Pending Devices
# =============================================================================

@router.get("/devices/pending", response_model=List[Device])
async def list_pending_devices(db: AsyncSession = Depends(get_db)):
    """List all devices with pending status"""
    result = await db.execute(
        select(DeviceDB)
        .where(DeviceDB.status == DeviceStatus.PENDING)
        .order_by(DeviceDB.created_at.desc())
    )
    return [device_db_to_response(d) for d in result.scalars().all()]


# =============================================================================
# Approval / Rejection / Blocking
# =============================================================================

@router.post("/devices/{device_id}/approve", response_model=Device)
async def approve_device(
    device_id: UUID,
    approval: DeviceApproval = None,
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending device. Optionally override name, set entity binding, and env vars."""
    result = await db.execute(
        select(DeviceDB).where(DeviceDB.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.status != DeviceStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Device is not pending (status: {device.status})")

    # Apply overrides
    if approval:
        if approval.name:
            device.name = approval.name
        if approval.device_type:
            device.device_type = approval.device_type

    device.status = DeviceStatus.ONLINE
    device.last_seen = datetime.utcnow()

    # Update provisioning record
    prov_result = await db.execute(
        select(DeviceProvisionDB).where(DeviceProvisionDB.device_id == device_id)
    )
    provision = prov_result.scalar_one_or_none()
    if provision:
        provision.provision_status = "approved"
        provision.approved_at = datetime.utcnow()
        # Build connection config from environment
        provision.connection_config = {
            "api_url": f"http://{os.getenv('HOST_IP', 'localhost')}:8080",
            "nats_url": f"nats://{os.getenv('HOST_IP', 'localhost')}:4222",
            "mqtt_broker": os.getenv('HOST_IP', 'localhost'),
            "mqtt_port": 1883,
            "ws_url": f"ws://{os.getenv('HOST_IP', 'localhost')}:8765",
        }
        if approval:
            if approval.entity_id:
                provision.entity_id = approval.entity_id
            if approval.env_vars:
                provision.env_vars = approval.env_vars

    await db.commit()
    await db.refresh(device)

    # Broadcast approval event
    await _broadcast_discovery_event("approved", {
        "device_id": str(device.id),
        "hardware_id": device.hardware_id,
        "name": device.name,
    })

    return device_db_to_response(device)


@router.post("/devices/{device_id}/reject")
async def reject_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Reject and delete a pending device"""
    result = await db.execute(
        select(DeviceDB).where(DeviceDB.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.status != DeviceStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Device is not pending (status: {device.status})")

    hardware_id = device.hardware_id
    device_name = device.name

    await db.delete(device)
    await db.commit()

    await _broadcast_discovery_event("rejected", {
        "device_id": str(device_id),
        "hardware_id": hardware_id,
        "name": device_name,
    })

    return {"status": "rejected", "device_id": str(device_id)}


@router.post("/devices/{device_id}/block")
async def block_device(
    device_id: UUID,
    request: BlockDeviceRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """Block a device's hardware_id and delete the device"""
    result = await db.execute(
        select(DeviceDB).where(DeviceDB.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    hardware_id = device.hardware_id

    # Add to blocked list
    blocked = BlockedDeviceDB(
        hardware_id=hardware_id,
        reason=request.reason if request else None,
    )
    db.add(blocked)

    # Delete the device
    await db.delete(device)
    await db.commit()

    await _broadcast_discovery_event("blocked", {
        "hardware_id": hardware_id,
        "reason": request.reason if request else None,
    })

    return {"status": "blocked", "hardware_id": hardware_id}


# =============================================================================
# Blocked Devices
# =============================================================================

@router.get("/devices/blocked", response_model=List[BlockedDeviceResponse])
async def list_blocked_devices(db: AsyncSession = Depends(get_db)):
    """List all blocked hardware IDs"""
    result = await db.execute(
        select(BlockedDeviceDB).order_by(BlockedDeviceDB.blocked_at.desc())
    )
    return [BlockedDeviceResponse.model_validate(b) for b in result.scalars().all()]


@router.delete("/devices/blocked/{hardware_id}")
async def unblock_device(
    hardware_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Remove a hardware_id from the blocked list"""
    result = await db.execute(
        select(BlockedDeviceDB).where(BlockedDeviceDB.hardware_id == hardware_id)
    )
    blocked = result.scalar_one_or_none()
    if not blocked:
        raise HTTPException(status_code=404, detail="Hardware ID not found in blocked list")

    await db.delete(blocked)
    await db.commit()

    return {"status": "unblocked", "hardware_id": hardware_id}


# =============================================================================
# Provisioning
# =============================================================================

@router.get("/devices/{device_id}/provision", response_model=DeviceProvisionResponse)
async def get_device_provision(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Device fetches its provisioning config after approval.
    Marks provision as 'provisioned' on first successful retrieval.
    """
    result = await db.execute(
        select(DeviceProvisionDB).where(DeviceProvisionDB.device_id == device_id)
    )
    provision = result.scalar_one_or_none()
    if not provision:
        raise HTTPException(status_code=404, detail="No provisioning record found")

    if provision.provision_status == "pending":
        raise HTTPException(status_code=403, detail="Device has not been approved yet")

    # Mark as provisioned on first retrieval
    if provision.provision_status == "approved":
        provision.provision_status = "provisioned"
        provision.provisioned_at = datetime.utcnow()
        await db.commit()
        await db.refresh(provision)

        await _broadcast_discovery_event("provisioned", {
            "device_id": str(device_id),
        })

    conn = provision.connection_config or {}
    return DeviceProvisionResponse(
        device_id=provision.device_id,
        provision_status=provision.provision_status,
        api_url=conn.get("api_url", f"http://{os.getenv('HOST_IP', 'localhost')}:8080"),
        nats_url=conn.get("nats_url", f"nats://{os.getenv('HOST_IP', 'localhost')}:4222"),
        mqtt_broker=conn.get("mqtt_broker", os.getenv('HOST_IP', 'localhost')),
        mqtt_port=conn.get("mqtt_port", 1883),
        ws_url=conn.get("ws_url", f"ws://{os.getenv('HOST_IP', 'localhost')}:8765"),
        entity_id=provision.entity_id,
        env_vars=provision.env_vars or {},
    )


@router.put("/devices/{device_id}/provision", response_model=DeviceProvisionResponse)
async def update_device_provision(
    device_id: UUID,
    update: DeviceApproval,
    db: AsyncSession = Depends(get_db),
):
    """Admin updates provisioning config (env vars, entity binding)"""
    result = await db.execute(
        select(DeviceProvisionDB).where(DeviceProvisionDB.device_id == device_id)
    )
    provision = result.scalar_one_or_none()
    if not provision:
        raise HTTPException(status_code=404, detail="No provisioning record found")

    if update.entity_id is not None:
        provision.entity_id = update.entity_id
    if update.env_vars is not None:
        provision.env_vars = update.env_vars

    await db.commit()
    await db.refresh(provision)

    conn = provision.connection_config or {}
    return DeviceProvisionResponse(
        device_id=provision.device_id,
        provision_status=provision.provision_status,
        api_url=conn.get("api_url", f"http://{os.getenv('HOST_IP', 'localhost')}:8080"),
        nats_url=conn.get("nats_url", f"nats://{os.getenv('HOST_IP', 'localhost')}:4222"),
        mqtt_broker=conn.get("mqtt_broker", os.getenv('HOST_IP', 'localhost')),
        mqtt_port=conn.get("mqtt_port", 1883),
        ws_url=conn.get("ws_url", f"ws://{os.getenv('HOST_IP', 'localhost')}:8765"),
        entity_id=provision.entity_id,
        env_vars=provision.env_vars or {},
    )
