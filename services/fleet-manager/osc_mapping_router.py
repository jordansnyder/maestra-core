"""
OSC Mapping API Router
CRUD operations for OSC address → entity state mappings
with NATS hot-reload signal to the OSC gateway
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from uuid import UUID
import json
import logging

from database import get_db, OscMappingDB
from models import (
    OscMappingCreate, OscMappingUpdate, OscMappingResponse,
    OscMappingImportResult, OscMappingBase
)
from state_manager import state_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/osc-mappings", tags=["osc-mappings"])

RELOAD_SUBJECT = "maestra.config.osc.reload"


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def db_to_response(db_obj: OscMappingDB) -> OscMappingResponse:
    """Convert SQLAlchemy model to Pydantic response"""
    return OscMappingResponse(
        id=db_obj.id,
        osc_address=db_obj.osc_address,
        entity_slug=db_obj.entity_slug,
        state_key=db_obj.state_key,
        state_keys=list(db_obj.state_keys) if db_obj.state_keys else None,
        operation=db_obj.operation,
        enabled=db_obj.enabled,
        description=db_obj.description,
        created_at=db_obj.created_at,
        updated_at=db_obj.updated_at,
    )


async def publish_reload():
    """Publish NATS reload signal to the OSC gateway"""
    try:
        if state_manager.nc and not state_manager.nc.is_closed:
            await state_manager.nc.publish(RELOAD_SUBJECT, b'')
            logger.info("Published OSC mappings reload signal")
        else:
            logger.warning("NATS not connected — OSC gateway will not receive reload signal")
    except Exception as e:
        logger.error(f"Failed to publish reload signal: {e}")


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/", response_model=List[OscMappingResponse])
async def list_mappings(
    enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    db: AsyncSession = Depends(get_db),
):
    """List all OSC mappings, optionally filtered by enabled status"""
    query = select(OscMappingDB)
    if enabled is not None:
        query = query.where(OscMappingDB.enabled == enabled)
    query = query.order_by(OscMappingDB.osc_address)

    result = await db.execute(query)
    mappings = result.scalars().all()
    return [db_to_response(m) for m in mappings]


@router.get("/export")
async def export_mappings(db: AsyncSession = Depends(get_db)):
    """Export all mappings as a JSON array matching the mappings.json format"""
    result = await db.execute(select(OscMappingDB).order_by(OscMappingDB.osc_address))
    mappings = result.scalars().all()

    export_data = []
    for m in mappings:
        entry = {
            "osc_address": m.osc_address,
            "entity_slug": m.entity_slug,
            "operation": m.operation,
        }
        if m.state_key is not None:
            entry["state_key"] = m.state_key
        if m.state_keys is not None:
            entry["state_keys"] = list(m.state_keys)
        if m.description:
            entry["description"] = m.description
        export_data.append(entry)

    return JSONResponse(content=export_data)


@router.get("/{mapping_id}", response_model=OscMappingResponse)
async def get_mapping(mapping_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single OSC mapping by ID"""
    result = await db.execute(select(OscMappingDB).where(OscMappingDB.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="OSC mapping not found")
    return db_to_response(mapping)


@router.post("/", response_model=OscMappingResponse, status_code=201)
async def create_mapping(data: OscMappingCreate, db: AsyncSession = Depends(get_db)):
    """Create a new OSC mapping"""
    # Check for duplicate osc_address
    existing = await db.execute(
        select(OscMappingDB).where(OscMappingDB.osc_address == data.osc_address)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"A mapping for OSC address '{data.osc_address}' already exists"
        )

    mapping = OscMappingDB(
        osc_address=data.osc_address,
        entity_slug=data.entity_slug,
        state_key=data.state_key,
        state_keys=data.state_keys,
        operation=data.operation,
        enabled=data.enabled,
        description=data.description,
    )
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)

    await publish_reload()
    return db_to_response(mapping)


@router.put("/{mapping_id}", response_model=OscMappingResponse)
async def update_mapping(
    mapping_id: UUID, data: OscMappingCreate, db: AsyncSession = Depends(get_db)
):
    """Full update of an OSC mapping"""
    result = await db.execute(select(OscMappingDB).where(OscMappingDB.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="OSC mapping not found")

    # Check for duplicate osc_address if it changed
    if data.osc_address != mapping.osc_address:
        existing = await db.execute(
            select(OscMappingDB).where(OscMappingDB.osc_address == data.osc_address)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"A mapping for OSC address '{data.osc_address}' already exists"
            )

    mapping.osc_address = data.osc_address
    mapping.entity_slug = data.entity_slug
    mapping.state_key = data.state_key
    mapping.state_keys = data.state_keys
    mapping.operation = data.operation
    mapping.enabled = data.enabled
    mapping.description = data.description

    await db.commit()
    await db.refresh(mapping)

    await publish_reload()
    return db_to_response(mapping)


@router.patch("/{mapping_id}", response_model=OscMappingResponse)
async def patch_mapping(
    mapping_id: UUID, data: OscMappingUpdate, db: AsyncSession = Depends(get_db)
):
    """Partial update of an OSC mapping (e.g., toggle enabled)"""
    result = await db.execute(select(OscMappingDB).where(OscMappingDB.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="OSC mapping not found")

    update_data = data.model_dump(exclude_unset=True)

    # Check for duplicate osc_address if it changed
    if 'osc_address' in update_data and update_data['osc_address'] != mapping.osc_address:
        existing = await db.execute(
            select(OscMappingDB).where(OscMappingDB.osc_address == update_data['osc_address'])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"A mapping for OSC address '{update_data['osc_address']}' already exists"
            )

    for key, value in update_data.items():
        setattr(mapping, key, value)

    await db.commit()
    await db.refresh(mapping)

    await publish_reload()
    return db_to_response(mapping)


@router.delete("/{mapping_id}", status_code=204)
async def delete_mapping(mapping_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete an OSC mapping"""
    result = await db.execute(select(OscMappingDB).where(OscMappingDB.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="OSC mapping not found")

    await db.delete(mapping)
    await db.commit()

    await publish_reload()
    return None


@router.post("/import", response_model=OscMappingImportResult)
async def import_mappings(
    mappings: List[dict],
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk import mappings from a JSON array (mappings.json format).
    Upserts on osc_address — existing mappings are updated, new ones created.
    """
    if len(mappings) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 mappings per import")

    created = 0
    updated = 0
    failed = 0
    errors = []

    for i, entry in enumerate(mappings):
        try:
            # Validate through Pydantic
            validated = OscMappingCreate(**entry)

            # Check for existing
            result = await db.execute(
                select(OscMappingDB).where(OscMappingDB.osc_address == validated.osc_address)
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.entity_slug = validated.entity_slug
                existing.state_key = validated.state_key
                existing.state_keys = validated.state_keys
                existing.operation = validated.operation
                existing.description = validated.description
                # Don't change enabled on import — preserve existing toggle state
                updated += 1
            else:
                mapping = OscMappingDB(
                    osc_address=validated.osc_address,
                    entity_slug=validated.entity_slug,
                    state_key=validated.state_key,
                    state_keys=validated.state_keys,
                    operation=validated.operation,
                    enabled=True,
                    description=validated.description,
                )
                db.add(mapping)
                created += 1

        except Exception as e:
            failed += 1
            errors.append(f"Row {i}: {str(e)}")

    if created > 0 or updated > 0:
        await db.commit()
        await publish_reload()

    return OscMappingImportResult(
        created=created,
        updated=updated,
        failed=failed,
        errors=errors,
    )
