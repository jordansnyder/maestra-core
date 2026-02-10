"""
Maestra Fleet Manager API
Device registration, configuration, monitoring, and entity state management
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
import os

from database import get_db, init_db, close_db, DeviceDB
from models import (
    Device, DeviceRegistration, DeviceHeartbeat,
    DeviceMetric, DeviceEvent, DeviceStatus
)
from state_manager import state_manager
from entity_router import router as entity_router
from routing_router import router as routing_router

# Initialize FastAPI app
app = FastAPI(
    title="Maestra Fleet Manager",
    description="Device, fleet, and entity state management API for Maestra infrastructure",
    version="0.2.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(entity_router)
app.include_router(routing_router)


# =============================================================================
# HEALTH & STATUS ENDPOINTS
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "fleet-manager",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/status")
async def get_status(db: AsyncSession = Depends(get_db)):
    """Get service status and statistics"""
    # Count devices
    from sqlalchemy import func
    result = await db.execute(select(func.count(DeviceDB.id)))
    total_devices = result.scalar() or 0

    result = await db.execute(
        select(func.count(DeviceDB.id)).where(DeviceDB.status == 'online')
    )
    online_devices = result.scalar() or 0

    # Count entities
    from database import EntityDB
    result = await db.execute(select(func.count(EntityDB.id)))
    total_entities = result.scalar() or 0

    return {
        "service": "fleet-manager",
        "version": "0.2.0",
        "devices": {
            "total": total_devices,
            "online": online_devices,
            "offline": total_devices - online_devices,
        },
        "entities": {
            "total": total_entities
        },
        "message_bus": {
            "connected": state_manager.is_connected
        },
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# DEVICE MANAGEMENT ENDPOINTS
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
        status=db_device.status or 'offline',
        last_seen=db_device.last_seen,
        created_at=db_device.created_at or datetime.utcnow(),
        updated_at=db_device.updated_at or datetime.utcnow()
    )


@app.post("/devices/register", response_model=Device)
async def register_device(
    registration: DeviceRegistration,
    db: AsyncSession = Depends(get_db)
):
    """Register a new device"""
    # Check if device already exists
    result = await db.execute(
        select(DeviceDB).where(DeviceDB.hardware_id == registration.hardware_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Device with hardware_id {registration.hardware_id} already registered"
        )

    # Create new device
    db_device = DeviceDB(
        name=registration.name,
        device_type=registration.device_type,
        hardware_id=registration.hardware_id,
        firmware_version=registration.firmware_version,
        ip_address=registration.ip_address,
        location=registration.location,
        device_metadata=registration.metadata,
        status='online',
        last_seen=datetime.utcnow()
    )

    db.add(db_device)
    await db.commit()
    await db.refresh(db_device)

    return device_db_to_response(db_device)


@app.get("/devices", response_model=List[Device])
async def list_devices(
    device_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List all devices with optional filtering"""
    query = select(DeviceDB)

    if device_type:
        query = query.where(DeviceDB.device_type == device_type)
    if status:
        query = query.where(DeviceDB.status == status)

    query = query.order_by(DeviceDB.name).limit(limit).offset(offset)

    result = await db.execute(query)
    devices = result.scalars().all()

    return [device_db_to_response(d) for d in devices]


@app.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific device by ID"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == device_id))
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    return device_db_to_response(db_device)


@app.post("/devices/heartbeat")
async def device_heartbeat(
    heartbeat: DeviceHeartbeat,
    db: AsyncSession = Depends(get_db)
):
    """Receive heartbeat from device to update status"""
    result = await db.execute(
        select(DeviceDB).where(DeviceDB.hardware_id == heartbeat.hardware_id)
    )
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(
            status_code=404,
            detail=f"Device with hardware_id {heartbeat.hardware_id} not found"
        )

    db_device.status = heartbeat.status
    db_device.last_seen = datetime.utcnow()

    if heartbeat.metadata:
        current_metadata = db_device.device_metadata or {}
        db_device.device_metadata = {**current_metadata, **heartbeat.metadata}

    await db.commit()

    return {"status": "ok", "device_id": str(db_device.id)}


@app.delete("/devices/{device_id}")
async def delete_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    """Unregister a device"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == device_id))
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    await db.execute(delete(DeviceDB).where(DeviceDB.id == device_id))
    await db.commit()

    return {"status": "deleted", "device_id": str(device_id)}


# =============================================================================
# METRICS & EVENTS ENDPOINTS
# =============================================================================

@app.post("/metrics")
async def submit_metric(metric: DeviceMetric, db: AsyncSession = Depends(get_db)):
    """Submit device metric data"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == metric.device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    # TODO: Store metric in TimescaleDB device_metrics table
    # For now, just acknowledge receipt

    return {"status": "ok", "metric": metric.metric_name}


@app.post("/events")
async def submit_event(event: DeviceEvent, db: AsyncSession = Depends(get_db)):
    """Submit device event"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == event.device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    # TODO: Store event in TimescaleDB device_events table
    # For now, just acknowledge receipt

    return {"status": "ok", "event_type": event.event_type}


# =============================================================================
# STARTUP & SHUTDOWN
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize connections on startup"""
    print("🚀 Maestra Fleet Manager starting up...")
    print(f"📊 Database: {os.getenv('DATABASE_URL', 'not configured')}")
    print(f"📨 NATS: {os.getenv('NATS_URL', 'not configured')}")
    print(f"📡 MQTT: {os.getenv('MQTT_BROKER', 'not configured')}")

    # Initialize database
    db_ok = await init_db()
    if not db_ok:
        print("⚠️ Database connection failed - running in degraded mode")

    # Initialize state manager (message bus)
    await state_manager.connect()

    print("✅ Fleet Manager ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 Maestra Fleet Manager shutting down...")
    await state_manager.disconnect()
    await close_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
