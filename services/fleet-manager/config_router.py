"""
Device Hardware Config API Router
CRUD operations for pre-provisionable device configurations keyed on hardware_id (MAC address)
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import logging

from database import get_db, DeviceHardwareConfigDB
from models import (
    DeviceHardwareConfigCreate, DeviceHardwareConfigUpdate, DeviceHardwareConfigResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/configs", tags=["device-configs"])


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def db_to_response(db_obj: DeviceHardwareConfigDB) -> DeviceHardwareConfigResponse:
    """Convert SQLAlchemy model to Pydantic response"""
    return DeviceHardwareConfigResponse(
        id=db_obj.id,
        hardware_id=db_obj.hardware_id,
        name=db_obj.name,
        configuration=db_obj.configuration or {},
        created_at=db_obj.created_at,
        updated_at=db_obj.updated_at,
    )


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/", response_model=List[DeviceHardwareConfigResponse])
async def list_configs(
    search: Optional[str] = Query(None, description="Filter by hardware_id or name"),
    db: AsyncSession = Depends(get_db),
):
    """List all device hardware configs"""
    query = select(DeviceHardwareConfigDB)
    if search:
        query = query.where(
            DeviceHardwareConfigDB.hardware_id.ilike(f"%{search}%")
            | DeviceHardwareConfigDB.name.ilike(f"%{search}%")
        )
    query = query.order_by(DeviceHardwareConfigDB.hardware_id)

    result = await db.execute(query)
    configs = result.scalars().all()
    return [db_to_response(c) for c in configs]


@router.post("/", response_model=DeviceHardwareConfigResponse, status_code=201)
async def create_config(data: DeviceHardwareConfigCreate, db: AsyncSession = Depends(get_db)):
    """Create a new device hardware config"""
    existing = await db.execute(
        select(DeviceHardwareConfigDB).where(DeviceHardwareConfigDB.hardware_id == data.hardware_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"A config for hardware_id '{data.hardware_id}' already exists"
        )

    config = DeviceHardwareConfigDB(
        hardware_id=data.hardware_id,
        name=data.name,
        configuration=data.configuration,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)

    logger.info(f"Created device config for hardware_id={data.hardware_id}")
    return db_to_response(config)


@router.get("/{hardware_id}", response_model=DeviceHardwareConfigResponse)
async def get_config(hardware_id: str, db: AsyncSession = Depends(get_db)):
    """Get a device hardware config by hardware_id"""
    result = await db.execute(
        select(DeviceHardwareConfigDB).where(DeviceHardwareConfigDB.hardware_id == hardware_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Device config not found")
    return db_to_response(config)


@router.put("/{hardware_id}", response_model=DeviceHardwareConfigResponse)
async def update_config(
    hardware_id: str, data: DeviceHardwareConfigUpdate, db: AsyncSession = Depends(get_db)
):
    """Update a device hardware config"""
    result = await db.execute(
        select(DeviceHardwareConfigDB).where(DeviceHardwareConfigDB.hardware_id == hardware_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Device config not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)

    logger.info(f"Updated device config for hardware_id={hardware_id}")
    return db_to_response(config)


@router.delete("/{hardware_id}", status_code=204)
async def delete_config(hardware_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a device hardware config"""
    result = await db.execute(
        select(DeviceHardwareConfigDB).where(DeviceHardwareConfigDB.hardware_id == hardware_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Device config not found")

    await db.delete(config)
    await db.commit()

    logger.info(f"Deleted device config for hardware_id={hardware_id}")
    return None


@router.get("/{hardware_id}/resolve")
async def resolve_config(hardware_id: str, db: AsyncSession = Depends(get_db)):
    """
    Device-facing endpoint: returns raw configuration JSON for a hardware_id.
    Returns {} if no config exists (never 404) so provisioning flows don't break.
    """
    result = await db.execute(
        select(DeviceHardwareConfigDB).where(DeviceHardwareConfigDB.hardware_id == hardware_id)
    )
    config = result.scalar_one_or_none()
    return config.configuration if config else {}
