"""
Maestra Fleet Manager API
Device registration, configuration, monitoring, and entity state management
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
import os
import json

from database import get_db, init_db, close_db, DeviceDB
from models import (
    Device, DeviceRegistration, DeviceUpdate, DeviceHeartbeat,
    DeviceMetric, DeviceEvent, DeviceStatus
)
from state_manager import state_manager
from stream_manager import stream_manager
from demo_simulator import demo_simulator
from redis_client import init_redis, close_redis, get_redis
from entity_router import router as entity_router
from routing_router import router as routing_router
from stream_router import router as stream_router
from stream_preview import router as stream_preview_router
from analytics_router import router as analytics_router
from cloud_router import router as cloud_router
from cloud_manager import cloud_manager
from discovery_router import router as discovery_router
from dmx_router import router as dmx_router
from fixtures_router import router as fixtures_router
from osc_mapping_router import router as osc_mapping_router
from dmx_playback_engine import playback_engine, engine_registry
from show_control_router import router as show_control_router, handle_show_command
from show_scheduler import show_scheduler

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
app.include_router(stream_router)
app.include_router(stream_preview_router)
app.include_router(analytics_router)
app.include_router(cloud_router)
app.include_router(discovery_router)
app.include_router(dmx_router)
app.include_router(fixtures_router)
app.include_router(osc_mapping_router)
app.include_router(show_control_router)


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
        configuration=db_device.configuration or {},
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
        configuration=registration.configuration or {},
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


@app.put("/devices/{device_id}/configuration", response_model=Device)
async def update_device_configuration(
    device_id: UUID,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """Update a device's configuration JSON"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == device_id))
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    db_device.configuration = body
    await db.commit()
    await db.refresh(db_device)

    return device_db_to_response(db_device)


@app.patch("/devices/{device_id}", response_model=Device)
async def update_device(
    device_id: UUID,
    data: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Partial update of a device (hardware_id is immutable)"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == device_id))
    db_device = result.scalar_one_or_none()

    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    update_data = data.model_dump(exclude_unset=True)

    # Map 'metadata' to the DB column name 'device_metadata'
    if 'metadata' in update_data:
        db_device.device_metadata = update_data.pop('metadata')

    for key, value in update_data.items():
        setattr(db_device, key, value)

    await db.commit()
    await db.refresh(db_device)

    return device_db_to_response(db_device)


# =============================================================================
# METRICS & EVENTS ENDPOINTS
# =============================================================================

@app.post("/metrics")
async def submit_metric(metric: DeviceMetric, db: AsyncSession = Depends(get_db)):
    """Submit device metric data"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == metric.device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    await db.execute(text("""
        INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
        VALUES (NOW(), :device_id, :metric_name, :metric_value, :unit, CAST(:tags AS jsonb))
    """), {
        "device_id": metric.device_id,
        "metric_name": metric.metric_name,
        "metric_value": metric.metric_value,
        "unit": metric.unit,
        "tags": json.dumps(metric.tags) if metric.tags else "{}"
    })
    await db.commit()

    return {"status": "ok", "metric": metric.metric_name}


@app.post("/events")
async def submit_event(event: DeviceEvent, db: AsyncSession = Depends(get_db)):
    """Submit device event"""
    result = await db.execute(select(DeviceDB).where(DeviceDB.id == event.device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    await db.execute(text("""
        INSERT INTO device_events (time, device_id, event_type, severity, message, data)
        VALUES (NOW(), :device_id, :event_type, :severity, :message, CAST(:data AS jsonb))
    """), {
        "device_id": event.device_id,
        "event_type": event.event_type,
        "severity": event.severity,
        "message": event.message,
        "data": json.dumps(event.data) if event.data else "{}"
    })
    await db.commit()

    return {"status": "ok", "event_type": event.event_type}


@app.post("/metrics/batch")
async def submit_metrics_batch(
    metrics: List[DeviceMetric],
    db: AsyncSession = Depends(get_db)
):
    """Submit multiple metrics in a single request"""
    if len(metrics) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 metrics per batch")

    for metric in metrics:
        await db.execute(text("""
            INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
            VALUES (NOW(), :device_id, :metric_name, :metric_value, :unit, CAST(:tags AS jsonb))
        """), {
            "device_id": metric.device_id,
            "metric_name": metric.metric_name,
            "metric_value": metric.metric_value,
            "unit": metric.unit,
            "tags": json.dumps(metric.tags) if metric.tags else "{}"
        })

    await db.commit()
    return {"status": "ok", "count": len(metrics)}


@app.post("/events/batch")
async def submit_events_batch(
    events: List[DeviceEvent],
    db: AsyncSession = Depends(get_db)
):
    """Submit multiple events in a single request"""
    if len(events) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 events per batch")

    for event in events:
        await db.execute(text("""
            INSERT INTO device_events (time, device_id, event_type, severity, message, data)
            VALUES (NOW(), :device_id, :event_type, :severity, :message, CAST(:data AS jsonb))
        """), {
            "device_id": event.device_id,
            "event_type": event.event_type,
            "severity": event.severity,
            "message": event.message,
            "data": json.dumps(event.data) if event.data else "{}"
        })

    await db.commit()
    return {"status": "ok", "count": len(events)}


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

    # Initialize Redis
    redis_ok = await init_redis()
    if not redis_ok:
        print("⚠️ Redis connection failed - streams will be unavailable")

    # Initialize state manager (message bus)
    await state_manager.connect()

    # Initialize stream manager (needs NATS from state_manager + Redis)
    if redis_ok and state_manager.nc:
        await stream_manager.connect(state_manager.nc, get_redis())
    else:
        print("⚠️ Stream Manager not started (requires Redis + NATS)")

    # Initialize cloud manager (needs Redis)
    if redis_ok:
        await cloud_manager.connect(get_redis())
    else:
        print("⚠️ Cloud Manager not started (requires Redis)")

    # Load persisted DMX settings (interval, etc.)
    if db_ok:
        await engine_registry.load_settings()
    # Subscribe NATS for external DMX lighting entity control
    if state_manager.nc:
        async def _on_dmx_lighting_state(msg):
            try:
                event = json.loads(msg.data.decode())
                if event.get('source') == 'dmx-engine':
                    return  # Ignore our own broadcasts
                current_state = event.get('current_state', {}) or {}
                # changed_keys is set by state_manager on internal updates; external
                # NATS messages may omit it — treat as "all keys changed" in that case.
                changed_keys = event.get('changed_keys') or list(current_state.keys())

                def _parse_seq_control(value):
                    """Parse active_sequence_id which can be:
                    - None/null  → stop
                    - str        → play once, stop on last values
                    - dict       → {id, loop?, fadeout?}  (fadeout in seconds)
                    Returns (seq_id, loop, fadeout_ms).
                    """
                    if value is None:
                        return None, False, None
                    if isinstance(value, str):
                        return value, False, None
                    if isinstance(value, dict):
                        seq_id = value.get('id')
                        loop = bool(value.get('loop', False))
                        fadeout_s = value.get('fadeout')
                        fadeout_ms = float(fadeout_s) * 1000.0 if fadeout_s is not None else None
                        return seq_id, loop, fadeout_ms
                    return None, False, None

                # ── Ungrouped (legacy) engine ─────────────────────────────────
                if 'active_sequence_id' in changed_keys or 'active_cue_id' in changed_keys:
                    raw_seq = current_state.get('active_sequence_id')
                    active_cue_id = current_state.get('active_cue_id')
                    seq_id, loop, fadeout_ms = _parse_seq_control(raw_seq)
                    if seq_id:
                        if playback_engine.status['sequence_id'] != seq_id:
                            await playback_engine.play(seq_id, loop=loop, fadeout_ms=fadeout_ms)
                    elif active_cue_id:
                        prev_cue = playback_engine.status.get('sequence_id')
                        await playback_engine.recall_cue_fade(prev_cue, active_cue_id, 0)
                    else:
                        if playback_engine.status['play_state'] != 'stopped':
                            await playback_engine.stop()

                # ── Per-group engines ─────────────────────────────────────────
                # group_playback: {<group_uuid>: {active_sequence_id, active_cue_id}}
                if 'group_playback' in changed_keys:
                    group_playback = current_state.get('group_playback') or {}
                    for group_id, control in group_playback.items():
                        if not isinstance(control, dict):
                            continue
                        grp_engine = engine_registry.get(group_id)
                        raw_seq = control.get('active_sequence_id')
                        cue_id = control.get('active_cue_id')
                        seq_id, loop, fadeout_ms = _parse_seq_control(raw_seq)
                        if seq_id:
                            if grp_engine.status['sequence_id'] != seq_id:
                                await grp_engine.play(seq_id, loop=loop, fadeout_ms=fadeout_ms)
                        elif cue_id:
                            await grp_engine.recall_cue_fade(None, cue_id, 0)
                        else:
                            if grp_engine.status['play_state'] != 'stopped':
                                await grp_engine.stop()
            except Exception as e:
                print(f"⚠️ DMX lighting state handler error: {e}")

        await state_manager.subscribe_nats(
            'maestra.entity.state.dmx_controller.dmx-lighting',
            _on_dmx_lighting_state,
        )
        print("✅ DMX lighting NATS subscriber active")

        # Subscribe to DMX gateway node heartbeats to update devices.last_seen
        async def _on_dmx_node_heartbeat(msg):
            try:
                data = json.loads(msg.data.decode())
                node_id = data.get('node_id')
                if not node_id:
                    return
                from database import get_db as _get_db
                from sqlalchemy import text as _text
                async for db in _get_db():
                    await db.execute(_text("""
                        UPDATE devices SET last_seen = NOW(), status = 'online'
                        WHERE id = (SELECT device_id FROM dmx_nodes WHERE id = CAST(:node_id AS uuid))
                    """), {"node_id": node_id})
                    await db.commit()
            except Exception as e:
                print(f"⚠️ DMX node heartbeat handler error: {e}")

        await state_manager.subscribe_nats(
            'maestra.dmx.node.heartbeat.*',
            _on_dmx_node_heartbeat,
        )
        print("✅ DMX node heartbeat subscriber active")

    # Subscribe NATS for inbound show control commands (OSC/MQTT bridged)
    if state_manager.nc:
        await state_manager.subscribe_nats('maestra.show.command.*', handle_show_command)
        await state_manager.subscribe_nats('maestra.osc.show.*', handle_show_command)
        print("✅ Show control NATS subscribers active")

    # Start show scheduler
    if db_ok:
        await show_scheduler.start()
        print("✅ Show scheduler started")

    # Start demo simulator if DEMO_MODE is enabled
    if os.getenv("DEMO_MODE", "").lower() == "true" and state_manager.nc:
        await demo_simulator.start(state_manager.nc)
        print("🎭 Demo simulator active — generating live sample data")

    print("✅ Fleet Manager ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 Maestra Fleet Manager shutting down...")
    await show_scheduler.stop()
    await engine_registry.shutdown_all()
    await demo_simulator.stop()
    await cloud_manager.disconnect()
    await stream_manager.disconnect()
    await state_manager.disconnect()
    await close_redis()
    await close_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
