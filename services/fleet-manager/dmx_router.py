"""
Maestra DMX / Art-Net Router

REST API for managing Art-Net nodes (hardware DMX converters) and DMX fixtures
(logical fixture definitions with canvas positions and channel maps).
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
import json

from database import get_db

router = APIRouter(prefix="/dmx", tags=["DMX"])


# =============================================================================
# Pydantic Models
# =============================================================================

from pydantic import BaseModel, Field


class UniverseConfig(BaseModel):
    id: int
    artnet_universe: int
    port_label: str = ""
    description: str = ""


class DMXNodeCreate(BaseModel):
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    ip_address: str
    mac_address: Optional[str] = None
    artnet_port: int = 6454
    universe_count: int = 4
    universes: List[UniverseConfig] = []
    poe_powered: bool = False
    firmware_version: Optional[str] = None
    notes: Optional[str] = None
    metadata: Dict[str, Any] = {}


class DMXNodeUpdate(BaseModel):
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    artnet_port: Optional[int] = None
    universe_count: Optional[int] = None
    universes: Optional[List[UniverseConfig]] = None
    poe_powered: Optional[bool] = None
    firmware_version: Optional[str] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ChannelMapping(BaseModel):
    offset: int
    type: str  # range, number, boolean, enum, color
    enum_dmx_values: Optional[Dict[str, int]] = None


class DMXFixtureCreate(BaseModel):
    name: str
    label: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    node_id: str
    universe: int
    start_channel: int = Field(..., ge=1, le=512)
    channel_count: int = 1
    fixture_mode: Optional[str] = None
    channel_map: Dict[str, ChannelMapping] = {}
    entity_id: Optional[str] = None
    position_x: float = 100.0
    position_y: float = 100.0
    metadata: Dict[str, Any] = {}


class DMXFixtureUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    node_id: Optional[str] = None
    universe: Optional[int] = None
    start_channel: Optional[int] = Field(None, ge=1, le=512)
    channel_count: Optional[int] = None
    fixture_mode: Optional[str] = None
    channel_map: Optional[Dict[str, ChannelMapping]] = None
    entity_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class FixturePositionUpdate(BaseModel):
    id: str
    position_x: float
    position_y: float


# =============================================================================
# Helpers
# =============================================================================

def _row_to_node(row) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "manufacturer": row.manufacturer,
        "model": row.model,
        "ip_address": row.ip_address,
        "mac_address": row.mac_address,
        "artnet_port": row.artnet_port,
        "universe_count": row.universe_count,
        "universes": row.universes if row.universes else [],
        "poe_powered": row.poe_powered,
        "firmware_version": row.firmware_version,
        "notes": row.notes,
        "metadata": row.metadata if row.metadata else {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _row_to_fixture(row) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "label": row.label,
        "manufacturer": row.manufacturer,
        "model": row.model,
        "node_id": str(row.node_id),
        "universe": row.universe,
        "start_channel": row.start_channel,
        "channel_count": row.channel_count,
        "fixture_mode": row.fixture_mode,
        "channel_map": row.channel_map if row.channel_map else {},
        "entity_id": str(row.entity_id) if row.entity_id else None,
        "position_x": row.position_x,
        "position_y": row.position_y,
        "metadata": row.metadata if row.metadata else {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# =============================================================================
# Art-Net Node Endpoints
# =============================================================================

@router.get("/nodes")
async def list_nodes(db: AsyncSession = Depends(get_db)):
    """List all configured Art-Net nodes."""
    result = await db.execute(text(
        "SELECT * FROM dmx_nodes ORDER BY created_at ASC"
    ))
    return [_row_to_node(r) for r in result.fetchall()]


@router.post("/nodes", status_code=201)
async def create_node(data: DMXNodeCreate, db: AsyncSession = Depends(get_db)):
    """Register a new Art-Net node (hardware DMX converter)."""
    node_id = str(uuid4())
    universes_json = json.dumps([u.model_dump() for u in data.universes])
    metadata_json = json.dumps(data.metadata)

    await db.execute(text("""
        INSERT INTO dmx_nodes (
            id, name, manufacturer, model, ip_address, mac_address,
            artnet_port, universe_count, universes, poe_powered,
            firmware_version, notes, metadata
        ) VALUES (
            :id, :name, :manufacturer, :model, :ip_address, :mac_address,
            :artnet_port, :universe_count, CAST(:universes AS jsonb), :poe_powered,
            :firmware_version, :notes, CAST(:metadata AS jsonb)
        )
    """), {
        "id": node_id,
        "name": data.name,
        "manufacturer": data.manufacturer,
        "model": data.model,
        "ip_address": data.ip_address,
        "mac_address": data.mac_address,
        "artnet_port": data.artnet_port,
        "universe_count": data.universe_count,
        "universes": universes_json,
        "poe_powered": data.poe_powered,
        "firmware_version": data.firmware_version,
        "notes": data.notes,
        "metadata": metadata_json,
    })
    await db.commit()

    result = await db.execute(text("SELECT * FROM dmx_nodes WHERE id = :id"), {"id": node_id})
    return _row_to_node(result.fetchone())


@router.get("/nodes/{node_id}")
async def get_node(node_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single Art-Net node by ID."""
    result = await db.execute(text("SELECT * FROM dmx_nodes WHERE id = :id"), {"id": node_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="DMX node not found")
    return _row_to_node(row)


@router.put("/nodes/{node_id}")
async def update_node(node_id: str, data: DMXNodeUpdate, db: AsyncSession = Depends(get_db)):
    """Update an Art-Net node configuration."""
    result = await db.execute(text("SELECT id FROM dmx_nodes WHERE id = :id"), {"id": node_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX node not found")

    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not updates:
        result = await db.execute(text("SELECT * FROM dmx_nodes WHERE id = :id"), {"id": node_id})
        return _row_to_node(result.fetchone())

    set_clauses = []
    params = {"id": node_id}
    for key, value in updates.items():
        if key == "universes":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps([u if isinstance(u, dict) else u.model_dump() for u in value])
        elif key == "metadata":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    await db.execute(text(
        f"UPDATE dmx_nodes SET {', '.join(set_clauses)} WHERE id = :id"
    ), params)
    await db.commit()

    result = await db.execute(text("SELECT * FROM dmx_nodes WHERE id = :id"), {"id": node_id})
    return _row_to_node(result.fetchone())


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an Art-Net node. Fails if fixtures are still assigned to it."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM dmx_fixtures WHERE node_id = :id"), {"id": node_id}
    )
    count = result.scalar()
    if count and count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete node: {count} fixture(s) are still assigned to it. Delete fixtures first."
        )

    result = await db.execute(text("DELETE FROM dmx_nodes WHERE id = :id RETURNING id"), {"id": node_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX node not found")
    await db.commit()
    return {"status": "deleted", "id": node_id}


# =============================================================================
# DMX Fixture Endpoints
# =============================================================================

@router.get("/fixtures")
async def list_fixtures(node_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """List DMX fixtures, optionally filtered by node."""
    if node_id:
        result = await db.execute(
            text("SELECT * FROM dmx_fixtures WHERE node_id = :node_id ORDER BY created_at ASC"),
            {"node_id": node_id}
        )
    else:
        result = await db.execute(text("SELECT * FROM dmx_fixtures ORDER BY created_at ASC"))
    return [_row_to_fixture(r) for r in result.fetchall()]


@router.post("/fixtures", status_code=201)
async def create_fixture(data: DMXFixtureCreate, db: AsyncSession = Depends(get_db)):
    """Create a new DMX fixture and place it on the canvas."""
    # Validate node exists
    node_result = await db.execute(
        text("SELECT id FROM dmx_nodes WHERE id = :id"), {"id": data.node_id}
    )
    if not node_result.fetchone():
        raise HTTPException(status_code=404, detail="DMX node not found")

    fixture_id = str(uuid4())
    channel_map_json = json.dumps({k: v.model_dump() for k, v in data.channel_map.items()})
    metadata_json = json.dumps(data.metadata)

    await db.execute(text("""
        INSERT INTO dmx_fixtures (
            id, name, label, manufacturer, model, node_id, universe,
            start_channel, channel_count, fixture_mode, channel_map,
            entity_id, position_x, position_y, metadata
        ) VALUES (
            :id, :name, :label, :manufacturer, :model, :node_id, :universe,
            :start_channel, :channel_count, :fixture_mode, CAST(:channel_map AS jsonb),
            :entity_id, :position_x, :position_y, CAST(:metadata AS jsonb)
        )
    """), {
        "id": fixture_id,
        "name": data.name,
        "label": data.label,
        "manufacturer": data.manufacturer,
        "model": data.model,
        "node_id": data.node_id,
        "universe": data.universe,
        "start_channel": data.start_channel,
        "channel_count": data.channel_count,
        "fixture_mode": data.fixture_mode,
        "channel_map": channel_map_json,
        "entity_id": data.entity_id,
        "position_x": data.position_x,
        "position_y": data.position_y,
        "metadata": metadata_json,
    })
    await db.commit()

    result = await db.execute(text("SELECT * FROM dmx_fixtures WHERE id = :id"), {"id": fixture_id})
    return _row_to_fixture(result.fetchone())


@router.get("/fixtures/{fixture_id}")
async def get_fixture(fixture_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single DMX fixture by ID."""
    result = await db.execute(
        text("SELECT * FROM dmx_fixtures WHERE id = :id"), {"id": fixture_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="DMX fixture not found")
    return _row_to_fixture(row)


@router.put("/fixtures/{fixture_id}")
async def update_fixture(fixture_id: str, data: DMXFixtureUpdate, db: AsyncSession = Depends(get_db)):
    """Update a DMX fixture (config, position, channel map)."""
    result = await db.execute(
        text("SELECT id FROM dmx_fixtures WHERE id = :id"), {"id": fixture_id}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX fixture not found")

    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not updates:
        result = await db.execute(
            text("SELECT * FROM dmx_fixtures WHERE id = :id"), {"id": fixture_id}
        )
        return _row_to_fixture(result.fetchone())

    set_clauses = []
    params = {"id": fixture_id}
    for key, value in updates.items():
        if key == "channel_map":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps({k: (v if isinstance(v, dict) else v.model_dump()) for k, v in value.items()})
        elif key == "metadata":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    await db.execute(text(
        f"UPDATE dmx_fixtures SET {', '.join(set_clauses)} WHERE id = :id"
    ), params)
    await db.commit()

    result = await db.execute(
        text("SELECT * FROM dmx_fixtures WHERE id = :id"), {"id": fixture_id}
    )
    return _row_to_fixture(result.fetchone())


@router.delete("/fixtures/{fixture_id}")
async def delete_fixture(fixture_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a DMX fixture from the canvas."""
    result = await db.execute(
        text("DELETE FROM dmx_fixtures WHERE id = :id RETURNING id"), {"id": fixture_id}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX fixture not found")
    await db.commit()
    return {"status": "deleted", "id": fixture_id}


@router.put("/fixtures/positions/bulk")
async def bulk_update_positions(
    positions: List[FixturePositionUpdate],
    db: AsyncSession = Depends(get_db)
):
    """Bulk update fixture canvas positions after a drag operation."""
    for pos in positions:
        await db.execute(text(
            "UPDATE dmx_fixtures SET position_x = :x, position_y = :y WHERE id = :id"
        ), {"id": pos.id, "x": pos.position_x, "y": pos.position_y})
    await db.commit()
    return {"status": "updated", "count": len(positions)}
