"""
Maestra Fleet Manager API
Device registration, configuration, and monitoring service
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
import os
import asyncio

# Initialize FastAPI app
app = FastAPI(
    title="Maestra Fleet Manager",
    description="Device and fleet management API for Maestra infrastructure",
    version="0.1.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# MODELS
# =============================================================================

class DeviceStatus(str):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    MAINTENANCE = "maintenance"


class Device(BaseModel):
    id: Optional[UUID] = Field(default_factory=uuid4)
    name: str
    device_type: str
    hardware_id: str
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: str = DeviceStatus.OFFLINE
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DeviceRegistration(BaseModel):
    name: str
    device_type: str
    hardware_id: str
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class DeviceHeartbeat(BaseModel):
    hardware_id: str
    status: str = DeviceStatus.ONLINE
    metadata: Optional[Dict[str, Any]] = None


class DeviceMetric(BaseModel):
    device_id: UUID
    metric_name: str
    metric_value: float
    unit: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None


class DeviceEvent(BaseModel):
    device_id: UUID
    event_type: str
    severity: str = "info"
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


# =============================================================================
# IN-MEMORY STORAGE (Replace with database in production)
# =============================================================================

devices_db: Dict[UUID, Device] = {}
devices_by_hardware_id: Dict[str, UUID] = {}


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
async def get_status():
    """Get service status and statistics"""
    return {
        "service": "fleet-manager",
        "version": "0.1.0",
        "devices": {
            "total": len(devices_db),
            "online": sum(1 for d in devices_db.values() if d.status == DeviceStatus.ONLINE),
            "offline": sum(1 for d in devices_db.values() if d.status == DeviceStatus.OFFLINE),
        },
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# DEVICE MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/devices/register", response_model=Device)
async def register_device(registration: DeviceRegistration):
    """Register a new device"""

    # Check if device already exists
    if registration.hardware_id in devices_by_hardware_id:
        existing_id = devices_by_hardware_id[registration.hardware_id]
        raise HTTPException(
            status_code=409,
            detail=f"Device with hardware_id {registration.hardware_id} already registered"
        )

    # Create new device
    device = Device(
        **registration.model_dump(),
        status=DeviceStatus.ONLINE,
        last_seen=datetime.utcnow()
    )

    devices_db[device.id] = device
    devices_by_hardware_id[device.hardware_id] = device.id

    return device


@app.get("/devices", response_model=List[Device])
async def list_devices(
    device_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """List all devices with optional filtering"""

    devices = list(devices_db.values())

    # Apply filters
    if device_type:
        devices = [d for d in devices if d.device_type == device_type]
    if status:
        devices = [d for d in devices if d.status == status]

    # Apply pagination
    return devices[offset:offset + limit]


@app.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: UUID):
    """Get a specific device by ID"""

    if device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")

    return devices_db[device_id]


@app.post("/devices/heartbeat")
async def device_heartbeat(heartbeat: DeviceHeartbeat):
    """Receive heartbeat from device to update status"""

    if heartbeat.hardware_id not in devices_by_hardware_id:
        raise HTTPException(
            status_code=404,
            detail=f"Device with hardware_id {heartbeat.hardware_id} not found"
        )

    device_id = devices_by_hardware_id[heartbeat.hardware_id]
    device = devices_db[device_id]

    device.status = heartbeat.status
    device.last_seen = datetime.utcnow()
    device.updated_at = datetime.utcnow()

    if heartbeat.metadata:
        device.metadata = {**(device.metadata or {}), **heartbeat.metadata}

    return {"status": "ok", "device_id": device_id}


@app.delete("/devices/{device_id}")
async def delete_device(device_id: UUID):
    """Unregister a device"""

    if device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")

    device = devices_db[device_id]
    del devices_by_hardware_id[device.hardware_id]
    del devices_db[device_id]

    return {"status": "deleted", "device_id": device_id}


# =============================================================================
# METRICS & EVENTS ENDPOINTS
# =============================================================================

@app.post("/metrics")
async def submit_metric(metric: DeviceMetric):
    """Submit device metric data"""

    if metric.device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")

    # TODO: Store metric in TimescaleDB
    # For now, just acknowledge receipt

    return {"status": "ok", "metric": metric.metric_name}


@app.post("/events")
async def submit_event(event: DeviceEvent):
    """Submit device event"""

    if event.device_id not in devices_db:
        raise HTTPException(status_code=404, detail="Device not found")

    # TODO: Store event in TimescaleDB
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
    print("✅ Fleet Manager ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 Maestra Fleet Manager shutting down...")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
