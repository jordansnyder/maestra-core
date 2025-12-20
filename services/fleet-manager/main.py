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
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, JSON, select, delete
from sqlalchemy.dialects.postgresql import UUID as PGUUID, INET

# Database setup
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://maestra:maestra_dev_password@postgres:5432/maestra')
# Convert postgresql:// to postgresql+asyncpg://
if DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://', 1)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Database Model
class DeviceDB(Base):
    __tablename__ = "devices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    device_type = Column(String(100), nullable=False)
    hardware_id = Column(String(255), unique=True, nullable=False)
    firmware_version = Column(String(50))
    ip_address = Column(INET)  # PostgreSQL INET type for IP addresses
    location = Column(JSON)
    device_metadata = Column('metadata', JSON)  # Map to 'metadata' column, avoid reserved word
    status = Column(String(50), default='offline')
    last_seen = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Dependency to get DB session
async def get_db():
    async with async_session_maker() as session:
        yield session

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


# Helper function to convert DB model to Pydantic model
def device_db_to_pydantic(db_device: DeviceDB) -> Device:
    return Device(
        id=db_device.id,
        name=db_device.name,
        device_type=db_device.device_type,
        hardware_id=db_device.hardware_id,
        firmware_version=db_device.firmware_version,
        ip_address=db_device.ip_address,
        location=db_device.location,
        metadata=db_device.device_metadata,  # Use device_metadata attribute
        status=db_device.status,
        last_seen=db_device.last_seen.isoformat() if db_device.last_seen else None,
        created_at=db_device.created_at.isoformat() if db_device.created_at else datetime.utcnow().isoformat(),
        updated_at=db_device.updated_at.isoformat() if db_device.updated_at else datetime.utcnow().isoformat()
    )


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

    # Get total count
    total_result = await db.execute(select(DeviceDB))
    all_devices = total_result.scalars().all()

    return {
        "service": "fleet-manager",
        "version": "0.1.0",
        "devices": {
            "total": len(all_devices),
            "online": sum(1 for d in all_devices if d.status == 'online'),
            "offline": sum(1 for d in all_devices if d.status == 'offline'),
        },
        "timestamp": datetime.utcnow().isoformat()
    }


# =============================================================================
# DEVICE MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/devices/register", response_model=Device)
async def register_device(registration: DeviceRegistration, db: AsyncSession = Depends(get_db)):
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
        device_metadata=registration.metadata,  # Use device_metadata attribute
        status='online',
        last_seen=datetime.utcnow()
    )

    db.add(db_device)
    await db.commit()
    await db.refresh(db_device)

    return device_db_to_pydantic(db_device)


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

    # Apply filters
    if device_type:
        query = query.where(DeviceDB.device_type == device_type)
    if status:
        query = query.where(DeviceDB.status == status)

    # Apply pagination
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    db_devices = result.scalars().all()

    return [device_db_to_pydantic(d) for d in db_devices]


@app.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific device by ID"""

    result = await db.execute(select(DeviceDB).where(DeviceDB.id == device_id))
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    return device_db_to_pydantic(db_device)


@app.post("/devices/heartbeat")
async def device_heartbeat(heartbeat: DeviceHeartbeat, db: AsyncSession = Depends(get_db)):
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
    db_device.updated_at = datetime.utcnow()

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
