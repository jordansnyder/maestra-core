"""
Routing API Router
Device routing, route management, and preset operations
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, update
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from database import get_db, RoutingDeviceDB, RouteDB, RoutePresetDB
from models import (
    RoutingDevice, RoutingDeviceCreate, RoutingDeviceUpdate,
    Route, RouteCreate, RouteBulkUpdate,
    RoutePreset, RoutePresetCreate, RoutePresetUpdate, RoutePresetDetail,
    RoutingState,
)

router = APIRouter(prefix="/routing", tags=["routing"])


# =============================================================================
# Helpers
# =============================================================================

def routing_device_db_to_response(db_device: RoutingDeviceDB) -> RoutingDevice:
    """Convert database model to response model"""
    return RoutingDevice(
        id=db_device.id,
        name=db_device.name,
        device_type=db_device.device_type,
        icon=db_device.icon or '📦',
        color=db_device.color or '#6C757D',
        inputs=db_device.inputs or [],
        outputs=db_device.outputs or [],
        metadata=db_device.routing_metadata or {},
        position_x=db_device.position_x or 0,
        position_y=db_device.position_y or 0,
        sort_order=db_device.sort_order or 0,
        created_at=db_device.created_at or datetime.utcnow(),
        updated_at=db_device.updated_at or datetime.utcnow(),
    )


def route_db_to_response(db_route: RouteDB) -> Route:
    """Convert database model to response model"""
    return Route(
        id=db_route.id,
        from_device_id=db_route.from_device_id,
        from_port=db_route.from_port,
        to_device_id=db_route.to_device_id,
        to_port=db_route.to_port,
        preset_id=db_route.preset_id,
        metadata=db_route.route_metadata or {},
        created_at=db_route.created_at or datetime.utcnow(),
    )


def preset_db_to_response(db_preset: RoutePresetDB, route_count: int = 0) -> RoutePreset:
    """Convert database model to response model"""
    return RoutePreset(
        id=db_preset.id,
        name=db_preset.name,
        description=db_preset.description,
        metadata=db_preset.preset_metadata or {},
        is_active=db_preset.is_active or False,
        route_count=route_count,
        created_at=db_preset.created_at or datetime.utcnow(),
        updated_at=db_preset.updated_at or datetime.utcnow(),
    )


# =============================================================================
# Full State Endpoint (single fetch for frontend)
# =============================================================================

@router.get("/state", response_model=RoutingState)
async def get_routing_state(db: AsyncSession = Depends(get_db)):
    """Get complete routing state: all devices, active routes, and presets"""
    # Devices
    result = await db.execute(
        select(RoutingDeviceDB).order_by(RoutingDeviceDB.sort_order, RoutingDeviceDB.name)
    )
    devices = [routing_device_db_to_response(d) for d in result.scalars().all()]

    # Active routes (preset_id IS NULL)
    result = await db.execute(
        select(RouteDB).where(RouteDB.preset_id.is_(None))
    )
    routes = [route_db_to_response(r) for r in result.scalars().all()]

    # Presets with route counts
    result = await db.execute(
        select(
            RoutePresetDB,
            func.count(RouteDB.id).label('route_count')
        )
        .outerjoin(RouteDB, RouteDB.preset_id == RoutePresetDB.id)
        .group_by(RoutePresetDB.id)
        .order_by(RoutePresetDB.name)
    )
    presets = [preset_db_to_response(p, rc) for p, rc in result.all()]

    return RoutingState(devices=devices, routes=routes, presets=presets)


# =============================================================================
# Routing Device CRUD
# =============================================================================

@router.get("/devices", response_model=List[RoutingDevice])
async def list_routing_devices(
    device_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List routing devices"""
    query = select(RoutingDeviceDB)

    if device_type:
        query = query.where(RoutingDeviceDB.device_type == device_type)

    query = query.order_by(RoutingDeviceDB.sort_order, RoutingDeviceDB.name).limit(limit).offset(offset)
    result = await db.execute(query)
    return [routing_device_db_to_response(d) for d in result.scalars().all()]


@router.get("/devices/{device_id}", response_model=RoutingDevice)
async def get_routing_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a routing device by ID"""
    result = await db.execute(
        select(RoutingDeviceDB).where(RoutingDeviceDB.id == device_id)
    )
    db_device = result.scalar_one_or_none()
    if not db_device:
        raise HTTPException(status_code=404, detail="Routing device not found")
    return routing_device_db_to_response(db_device)


@router.post("/devices", response_model=RoutingDevice, status_code=201)
async def create_routing_device(
    device: RoutingDeviceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new routing device"""
    db_device = RoutingDeviceDB(
        name=device.name,
        device_type=device.device_type,
        icon=device.icon,
        color=device.color,
        inputs=device.inputs,
        outputs=device.outputs,
        routing_metadata=device.metadata,
        position_x=device.position_x,
        position_y=device.position_y,
        sort_order=device.sort_order,
    )
    db.add(db_device)
    await db.commit()
    await db.refresh(db_device)
    return routing_device_db_to_response(db_device)


@router.put("/devices/{device_id}", response_model=RoutingDevice)
async def update_routing_device(
    device_id: UUID,
    device_update: RoutingDeviceUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a routing device"""
    result = await db.execute(
        select(RoutingDeviceDB).where(RoutingDeviceDB.id == device_id)
    )
    db_device = result.scalar_one_or_none()
    if not db_device:
        raise HTTPException(status_code=404, detail="Routing device not found")

    update_data = device_update.model_dump(exclude_unset=True)

    # Map 'metadata' field name to DB column
    if 'metadata' in update_data:
        update_data['routing_metadata'] = update_data.pop('metadata')

    for key, value in update_data.items():
        setattr(db_device, key, value)

    await db.commit()
    await db.refresh(db_device)
    return routing_device_db_to_response(db_device)


@router.delete("/devices/{device_id}")
async def delete_routing_device(device_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a routing device and its routes"""
    result = await db.execute(
        select(RoutingDeviceDB).where(RoutingDeviceDB.id == device_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Routing device not found")

    await db.execute(delete(RoutingDeviceDB).where(RoutingDeviceDB.id == device_id))
    await db.commit()
    return {"status": "deleted", "device_id": str(device_id)}


@router.put("/devices/positions")
async def update_device_positions(
    positions: dict,
    db: AsyncSession = Depends(get_db)
):
    """Batch update device node graph positions. Expects {device_id: {x, y}}"""
    for device_id_str, pos in positions.items():
        device_id = UUID(device_id_str)
        await db.execute(
            update(RoutingDeviceDB)
            .where(RoutingDeviceDB.id == device_id)
            .values(position_x=pos.get('x', 0), position_y=pos.get('y', 0))
        )
    await db.commit()
    return {"status": "ok", "updated": len(positions)}


# =============================================================================
# Route CRUD
# =============================================================================

@router.get("/routes", response_model=List[Route])
async def list_routes(
    preset_id: Optional[UUID] = Query(None, description="Filter by preset; omit for active routes"),
    active_only: bool = Query(True, description="Only return active (non-preset) routes"),
    db: AsyncSession = Depends(get_db)
):
    """List routes"""
    query = select(RouteDB)

    if preset_id:
        query = query.where(RouteDB.preset_id == preset_id)
    elif active_only:
        query = query.where(RouteDB.preset_id.is_(None))

    result = await db.execute(query)
    return [route_db_to_response(r) for r in result.scalars().all()]


@router.post("/routes", response_model=Route, status_code=201)
async def create_route(
    route: RouteCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a single route"""
    # Validate devices exist
    for dev_id in [route.from_device_id, route.to_device_id]:
        result = await db.execute(
            select(RoutingDeviceDB).where(RoutingDeviceDB.id == dev_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Routing device {dev_id} not found")

    # Validate ports exist on devices
    from_result = await db.execute(
        select(RoutingDeviceDB).where(RoutingDeviceDB.id == route.from_device_id)
    )
    from_device = from_result.scalar_one()
    if route.from_port not in (from_device.outputs or []):
        raise HTTPException(status_code=400, detail=f"Port '{route.from_port}' not found on device outputs")

    to_result = await db.execute(
        select(RoutingDeviceDB).where(RoutingDeviceDB.id == route.to_device_id)
    )
    to_device = to_result.scalar_one()
    if route.to_port not in (to_device.inputs or []):
        raise HTTPException(status_code=400, detail=f"Port '{route.to_port}' not found on device inputs")

    # Check for duplicate
    result = await db.execute(
        select(RouteDB).where(
            RouteDB.from_device_id == route.from_device_id,
            RouteDB.from_port == route.from_port,
            RouteDB.to_device_id == route.to_device_id,
            RouteDB.to_port == route.to_port,
            RouteDB.preset_id.is_(None),
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Route already exists")

    db_route = RouteDB(
        from_device_id=route.from_device_id,
        from_port=route.from_port,
        to_device_id=route.to_device_id,
        to_port=route.to_port,
        route_metadata=route.metadata,
    )
    db.add(db_route)
    await db.commit()
    await db.refresh(db_route)
    return route_db_to_response(db_route)


@router.delete("/routes/{route_id}")
async def delete_route(route_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a route by ID"""
    result = await db.execute(select(RouteDB).where(RouteDB.id == route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Route not found")

    await db.execute(delete(RouteDB).where(RouteDB.id == route_id))
    await db.commit()
    return {"status": "deleted", "route_id": str(route_id)}


@router.delete("/routes")
async def delete_route_by_ports(
    from_device_id: UUID = Query(..., alias="from"),
    from_port: str = Query(..., alias="fromPort"),
    to_device_id: UUID = Query(..., alias="to"),
    to_port: str = Query(..., alias="toPort"),
    db: AsyncSession = Depends(get_db)
):
    """Delete a route by its from/to device+port combination"""
    result = await db.execute(
        select(RouteDB).where(
            RouteDB.from_device_id == from_device_id,
            RouteDB.from_port == from_port,
            RouteDB.to_device_id == to_device_id,
            RouteDB.to_port == to_port,
            RouteDB.preset_id.is_(None),
        )
    )
    db_route = result.scalar_one_or_none()
    if not db_route:
        raise HTTPException(status_code=404, detail="Route not found")

    await db.execute(delete(RouteDB).where(RouteDB.id == db_route.id))
    await db.commit()
    return {"status": "deleted"}


@router.put("/routes", response_model=List[Route])
async def replace_all_routes(
    bulk: RouteBulkUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Replace all active routes with a new set"""
    # Delete all active routes
    await db.execute(delete(RouteDB).where(RouteDB.preset_id.is_(None)))

    # Insert new routes
    new_routes = []
    for route in bulk.routes:
        db_route = RouteDB(
            from_device_id=route.from_device_id,
            from_port=route.from_port,
            to_device_id=route.to_device_id,
            to_port=route.to_port,
            route_metadata=route.metadata,
        )
        db.add(db_route)
        new_routes.append(db_route)

    await db.commit()

    # Refresh all to get generated IDs
    for r in new_routes:
        await db.refresh(r)

    return [route_db_to_response(r) for r in new_routes]


@router.delete("/routes/all")
async def clear_all_routes(db: AsyncSession = Depends(get_db)):
    """Clear all active routes"""
    result = await db.execute(
        delete(RouteDB).where(RouteDB.preset_id.is_(None))
    )
    await db.commit()
    return {"status": "cleared", "deleted_count": result.rowcount}


# =============================================================================
# Route Preset CRUD
# =============================================================================

@router.get("/presets", response_model=List[RoutePreset])
async def list_presets(db: AsyncSession = Depends(get_db)):
    """List all route presets"""
    result = await db.execute(
        select(
            RoutePresetDB,
            func.count(RouteDB.id).label('route_count')
        )
        .outerjoin(RouteDB, RouteDB.preset_id == RoutePresetDB.id)
        .group_by(RoutePresetDB.id)
        .order_by(RoutePresetDB.name)
    )
    return [preset_db_to_response(p, rc) for p, rc in result.all()]


@router.get("/presets/{preset_id}", response_model=RoutePresetDetail)
async def get_preset(preset_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a preset with its routes"""
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.id == preset_id)
    )
    db_preset = result.scalar_one_or_none()
    if not db_preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    result = await db.execute(
        select(RouteDB).where(RouteDB.preset_id == preset_id)
    )
    routes = [route_db_to_response(r) for r in result.scalars().all()]

    return RoutePresetDetail(
        id=db_preset.id,
        name=db_preset.name,
        description=db_preset.description,
        metadata=db_preset.preset_metadata or {},
        is_active=db_preset.is_active or False,
        route_count=len(routes),
        routes=routes,
        created_at=db_preset.created_at or datetime.utcnow(),
        updated_at=db_preset.updated_at or datetime.utcnow(),
    )


@router.post("/presets", response_model=RoutePreset, status_code=201)
async def create_preset(
    preset: RoutePresetCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new preset (empty, no routes yet)"""
    # Check name uniqueness
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.name == preset.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Preset '{preset.name}' already exists")

    db_preset = RoutePresetDB(
        name=preset.name,
        description=preset.description,
        preset_metadata=preset.metadata,
    )
    db.add(db_preset)
    await db.commit()
    await db.refresh(db_preset)
    return preset_db_to_response(db_preset, 0)


@router.put("/presets/{preset_id}", response_model=RoutePreset)
async def update_preset(
    preset_id: UUID,
    preset_update: RoutePresetUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update preset metadata"""
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.id == preset_id)
    )
    db_preset = result.scalar_one_or_none()
    if not db_preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    update_data = preset_update.model_dump(exclude_unset=True)
    if 'metadata' in update_data:
        update_data['preset_metadata'] = update_data.pop('metadata')

    for key, value in update_data.items():
        setattr(db_preset, key, value)

    await db.commit()
    await db.refresh(db_preset)

    # Get route count
    rc_result = await db.execute(
        select(func.count(RouteDB.id)).where(RouteDB.preset_id == preset_id)
    )
    route_count = rc_result.scalar() or 0

    return preset_db_to_response(db_preset, route_count)


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a preset and all its routes"""
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.id == preset_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Preset not found")

    await db.execute(delete(RoutePresetDB).where(RoutePresetDB.id == preset_id))
    await db.commit()
    return {"status": "deleted", "preset_id": str(preset_id)}


@router.post("/presets/{preset_id}/save")
async def save_current_to_preset(
    preset_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Save the current active routing table into a preset (snapshot)"""
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.id == preset_id)
    )
    db_preset = result.scalar_one_or_none()
    if not db_preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Delete existing preset routes
    await db.execute(delete(RouteDB).where(RouteDB.preset_id == preset_id))

    # Copy active routes into this preset
    result = await db.execute(
        select(RouteDB).where(RouteDB.preset_id.is_(None))
    )
    active_routes = result.scalars().all()

    for r in active_routes:
        db.add(RouteDB(
            from_device_id=r.from_device_id,
            from_port=r.from_port,
            to_device_id=r.to_device_id,
            to_port=r.to_port,
            preset_id=preset_id,
            route_metadata=r.route_metadata,
        ))

    await db.commit()
    return {"status": "saved", "route_count": len(active_routes)}


@router.post("/presets/{preset_id}/recall")
async def recall_preset(
    preset_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Load a preset as the active routing table (replaces current routes)"""
    result = await db.execute(
        select(RoutePresetDB).where(RoutePresetDB.id == preset_id)
    )
    db_preset = result.scalar_one_or_none()
    if not db_preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Clear all active routes
    await db.execute(delete(RouteDB).where(RouteDB.preset_id.is_(None)))

    # Copy preset routes as active
    result = await db.execute(
        select(RouteDB).where(RouteDB.preset_id == preset_id)
    )
    preset_routes = result.scalars().all()

    new_routes = []
    for r in preset_routes:
        new_route = RouteDB(
            from_device_id=r.from_device_id,
            from_port=r.from_port,
            to_device_id=r.to_device_id,
            to_port=r.to_port,
            preset_id=None,  # Active table
            route_metadata=r.route_metadata,
        )
        db.add(new_route)
        new_routes.append(new_route)

    # Mark this preset as active, clear others
    await db.execute(
        update(RoutePresetDB).values(is_active=False)
    )
    db_preset.is_active = True

    await db.commit()
    return {"status": "recalled", "preset_name": db_preset.name, "route_count": len(new_routes)}
