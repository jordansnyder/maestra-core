"""
Maestra DMX / Art-Net Router

REST API for managing Art-Net nodes (hardware DMX converters) and DMX fixtures
(logical fixture definitions with canvas positions and channel maps).

Entity linking: a DMX fixture can be linked to a Maestra entity via entity_id.
The link is stored as a proper FK (dmx_fixtures.entity_id → entities.id) with
ON DELETE SET NULL semantics. This router validates that the referenced entity
exists before persisting any create or update, returning clean 404 errors rather
than raw constraint failures.

Reverse lookup: GET /dmx/fixtures?entity_id=<uuid> or
                GET /dmx/entities/<entity_id>/fixture
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
import json

from database import get_db
from redis_client import get_redis
from state_manager import state_manager

router = APIRouter(prefix="/dmx", tags=["DMX"])

DMX_PAUSE_KEY = "dmx:output:paused"
_DMX_LIGHTING_SLUG = "dmx-lighting"


async def _sync_dmx_lighting_entity(db: AsyncSession) -> None:
    """Rebuild and persist the DMX Lighting entity state from current cues and sequences.

    Executes an UPDATE within the caller's transaction — the caller must commit.
    Safe to call even if the entity does not exist yet (UPDATE is a no-op in that case).
    """
    cue_rows = await db.execute(text("""
        SELECT id, name, fade_duration, sort_order
        FROM dmx_cues ORDER BY sort_order ASC, created_at ASC
    """))
    cues = [
        {"id": str(r.id), "name": r.name, "fade_duration": float(r.fade_duration or 0)}
        for r in cue_rows.fetchall()
    ]

    seq_rows = await db.execute(text("""
        SELECT s.id, s.name, s.fade_out_duration, s.sort_order,
               (SELECT COUNT(*) FROM dmx_sequence_cues sc WHERE sc.sequence_id = s.id) AS cue_count
        FROM dmx_sequences s
        ORDER BY s.sort_order ASC, s.created_at ASC
    """))
    sequences = [
        {
            "id": str(r.id),
            "name": r.name,
            "cue_count": int(r.cue_count),
            "fade_out_duration": float(r.fade_out_duration or 3),
        }
        for r in seq_rows.fetchall()
    ]

    # Preserve active playback fields so mutations don't interrupt running sequences
    existing_row = await db.execute(text("""
        SELECT state FROM entities WHERE slug = :slug
    """), {"slug": _DMX_LIGHTING_SLUG})
    existing = existing_row.fetchone()
    existing_state = (existing.state if existing else {}) or {}

    state = json.dumps({
        "cues": cues,
        "sequences": sequences,
        "active_cue_id": existing_state.get("active_cue_id"),
        "active_sequence_id": existing_state.get("active_sequence_id"),
    })

    await db.execute(text("""
        UPDATE entities
        SET state = CAST(:state AS jsonb), state_updated_at = NOW()
        WHERE slug = :slug
    """), {"state": state, "slug": _DMX_LIGHTING_SLUG})
DMX_CONTROL_SUBJECT = "maestra.dmx.control"


# =============================================================================
# Pydantic Models
# =============================================================================

from pydantic import BaseModel, Field


class UniverseConfig(BaseModel):
    id: int
    artnet_universe: int
    port_label: str = ""
    description: str = ""
    color: Optional[str] = None


class DMXNodeCreate(BaseModel):
    name: str
    slug: Optional[str] = None
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
    slug: Optional[str] = None
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
    node_id: UUID
    universe: int
    start_channel: int = Field(..., ge=1, le=512)
    channel_count: int = 1
    fixture_mode: Optional[str] = None
    channel_map: Dict[str, ChannelMapping] = {}
    # UUID validated at model layer; existence validated against entities table at write time
    entity_id: Optional[UUID] = None
    ofl_fixture_id: Optional[str] = None
    position_x: float = 100.0
    position_y: float = 100.0
    metadata: Dict[str, Any] = {}


class DMXFixtureUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    node_id: Optional[UUID] = None
    universe: Optional[int] = None
    start_channel: Optional[int] = Field(None, ge=1, le=512)
    channel_count: Optional[int] = None
    fixture_mode: Optional[str] = None
    channel_map: Optional[Dict[str, ChannelMapping]] = None
    # Pass null explicitly to unlink; omit to leave unchanged.
    # exclude_unset=True in model_dump() distinguishes "omitted" from "set to null".
    entity_id: Optional[UUID] = Field(default=None)
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class FixturePositionUpdate(BaseModel):
    id: UUID
    position_x: float
    position_y: float


# =============================================================================
# Helpers
# =============================================================================

def _row_to_node(row) -> dict:
    keys = row._mapping.keys() if hasattr(row, '_mapping') else []
    return {
        "id": str(row.id),
        "name": row.name,
        "slug": row.hardware_id if 'hardware_id' in keys else None,
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
        "device_id": str(row.device_id) if row.device_id else None,
        "last_seen": row.last_seen.isoformat() if 'last_seen' in keys and row.last_seen else None,
        "sort_order": row.sort_order if hasattr(row, "sort_order") else 0,
        "metadata": row.metadata if row.metadata else {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _row_to_fixture(row) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "label": row.label,
        "ofl_manufacturer": getattr(row, "ofl_manufacturer", None),
        "ofl_model": getattr(row, "ofl_model", None),
        "node_id": str(row.node_id),
        "universe": row.universe,
        "start_channel": row.start_channel,
        "channel_count": row.channel_count,
        "fixture_mode": row.fixture_mode,
        "channel_map": row.channel_map if row.channel_map else {},
        "entity_id": str(row.entity_id) if row.entity_id else None,
        "ofl_fixture_id": str(row.ofl_fixture_id) if row.ofl_fixture_id else None,
        "position_x": row.position_x,
        "position_y": row.position_y,
        "sort_order": row.sort_order if hasattr(row, "sort_order") else 0,
        "metadata": row.metadata if row.metadata else {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# SQL fragment for selecting fixtures with OFL manufacturer + model joined in
_FIXTURE_SELECT = """
    SELECT
        f.*,
        m.name AS ofl_manufacturer,
        of2.name AS ofl_model
    FROM dmx_fixtures f
    LEFT JOIN ofl_fixtures of2 ON of2.id = f.ofl_fixture_id
    LEFT JOIN ofl_manufacturers m ON m.key = of2.manufacturer_key
"""


def _sanitize_var_name(raw: str) -> str:
    """Sanitize a channel name into a valid variable key."""
    import re
    name = raw.lower()
    name = re.sub(r'[^a-z0-9]+', '_', name)
    name = name.strip('_')
    return name


async def _build_channel_map_from_ofl(
    ofl_fixture_id: str,
    fixture_mode: Optional[str],
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Look up OFL fixture modes from the database and build a channel_map dict
    from the matching mode (or first mode if fixture_mode is not specified).

    Returns None if the OFL fixture is not found or has no modes.
    """
    result = await db.execute(
        text("SELECT modes FROM ofl_fixtures WHERE id = :id"),
        {"id": ofl_fixture_id},
    )
    row = result.fetchone()
    if not row or not row.modes:
        return None

    modes_data = row.modes
    if isinstance(modes_data, str):
        try:
            modes_data = json.loads(modes_data)
        except (json.JSONDecodeError, TypeError):
            return None

    if not isinstance(modes_data, list) or len(modes_data) == 0:
        return None

    # Find the matching mode
    selected_mode = None
    if fixture_mode:
        for m in modes_data:
            if m.get("shortName") == fixture_mode or m.get("name") == fixture_mode:
                selected_mode = m
                break

    if selected_mode is None:
        selected_mode = modes_data[0]

    channels = selected_mode.get("channels", [])
    channel_map: Dict[str, Any] = {}
    for i, ch in enumerate(channels):
        if isinstance(ch, str):
            ch_name = ch
            ch_type = "range"
            ch_default = 0
        else:
            ch_name = ch.get("name", f"channel_{i + 1}")
            ch_type = ch.get("type", "range")
            ch_default = ch.get("defaultValue", 0) or 0

        var_name = _sanitize_var_name(ch_name)
        if not var_name:
            var_name = f"channel_{i + 1}"

        # Avoid duplicate keys by appending index if needed
        if var_name in channel_map:
            var_name = f"{var_name}_{i + 1}"

        channel_map[var_name] = {
            "offset": i + 1,
            "type": "range",
            "label": ch_name,
            "dmx_min": 0,
            "dmx_max": 255,
            "enum_dmx_values": None,
        }

    return channel_map if channel_map else None


async def _require_entity(entity_id: UUID, db: AsyncSession) -> None:
    """Raise 404 if the referenced entity does not exist."""
    result = await db.execute(
        text("SELECT id FROM entities WHERE id = :id"),
        {"id": str(entity_id)},
    )
    if not result.fetchone():
        raise HTTPException(
            status_code=404,
            detail=f"Entity '{entity_id}' not found. Create the entity first or leave entity_id unset.",
        )


async def _require_node(node_id: UUID, db: AsyncSession) -> None:
    """Raise 404 if the referenced DMX node does not exist."""
    result = await db.execute(
        text("SELECT id FROM dmx_nodes WHERE id = :id"),
        {"id": str(node_id)},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX node not found")


# =============================================================================
# Art-Net Node Endpoints
# =============================================================================

@router.get("/nodes")
async def list_nodes(db: AsyncSession = Depends(get_db)):
    """List all configured Art-Net nodes."""
    result = await db.execute(text("""
        SELECT n.*, d.hardware_id, d.last_seen
        FROM dmx_nodes n
        LEFT JOIN devices d ON d.id = n.device_id
        ORDER BY n.sort_order ASC, n.created_at ASC
    """))
    return [_row_to_node(r) for r in result.fetchall()]


@router.put("/nodes/reorder")
async def reorder_nodes(ids: List[str], db: AsyncSession = Depends(get_db)):
    """Persist a new node order by assigning sort_order = array index."""
    for i, node_id in enumerate(ids):
        await db.execute(text(
            "UPDATE dmx_nodes SET sort_order = :order WHERE id = :id"
        ), {"order": i, "id": node_id})
    await db.commit()
    return {"reordered": len(ids)}


@router.post("/nodes", status_code=201)
async def create_node(data: DMXNodeCreate, db: AsyncSession = Depends(get_db)):
    """Register a new Art-Net node and auto-create a linked Maestra device."""
    node_id = str(uuid4())
    device_id = str(uuid4())
    universes_json = json.dumps([u.model_dump() for u in data.universes])
    metadata_json = json.dumps(data.metadata)

    # Auto-create a linked device record for this Art-Net node
    import re as _re
    hardware_id = data.slug or _re.sub(r'[^a-z0-9]+', '-', data.name.lower()).strip('-') or data.ip_address
    device_meta = json.dumps({
        "artnet_node": True,
        "ip_address": data.ip_address,
        "artnet_port": data.artnet_port,
    })
    await db.execute(text("""
        INSERT INTO devices (id, name, device_type, hardware_id, ip_address, status, metadata)
        VALUES (:id, :name, 'artnet_node', :hardware_id, :ip_address, 'online', CAST(:metadata AS jsonb))
    """), {
        "id": device_id,
        "name": data.name,
        "hardware_id": hardware_id,
        "ip_address": data.ip_address,
        "metadata": device_meta,
    })

    await db.execute(text("""
        INSERT INTO dmx_nodes (
            id, name, manufacturer, model, ip_address, mac_address,
            artnet_port, universe_count, universes, poe_powered,
            firmware_version, notes, device_id, sort_order, metadata
        ) VALUES (
            :id, :name, :manufacturer, :model, :ip_address, :mac_address,
            :artnet_port, :universe_count, CAST(:universes AS jsonb), :poe_powered,
            :firmware_version, :notes, :device_id,
            COALESCE((SELECT MAX(sort_order) + 1 FROM dmx_nodes), 0),
            CAST(:metadata AS jsonb)
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
        "device_id": device_id,
        "metadata": metadata_json,
    })
    await db.commit()

    result = await db.execute(text("""
        SELECT n.*, d.hardware_id, d.last_seen
        FROM dmx_nodes n LEFT JOIN devices d ON d.id = n.device_id
        WHERE n.id = :id
    """), {"id": node_id})
    return _row_to_node(result.fetchone())


@router.get("/nodes/{node_id}")
async def get_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single Art-Net node by ID."""
    result = await db.execute(text("""
        SELECT n.*, d.hardware_id, d.last_seen
        FROM dmx_nodes n
        LEFT JOIN devices d ON d.id = n.device_id
        WHERE n.id = :id
    """), {"id": str(node_id)})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="DMX node not found")
    return _row_to_node(row)


@router.put("/nodes/{node_id}")
async def update_node(node_id: UUID, data: DMXNodeUpdate, db: AsyncSession = Depends(get_db)):
    """Update an Art-Net node configuration."""
    await _require_node(node_id, db)

    updates = data.model_dump(exclude_unset=True)

    # Separate slug from node-table fields — slug lives in devices.hardware_id
    new_slug = updates.pop("slug", None)

    node_updates = {k: v for k, v in updates.items()}

    if node_updates:
        set_clauses = []
        params: Dict[str, Any] = {"id": str(node_id)}
        for key, value in node_updates.items():
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

    # Sync changed ip_address and/or slug back to the linked devices row
    device_set: list[str] = []
    device_params: Dict[str, Any] = {"node_id": str(node_id)}
    if new_slug is not None:
        device_set.append("hardware_id = :hardware_id")
        device_params["hardware_id"] = new_slug
    if "ip_address" in node_updates:
        device_set.append("ip_address = :ip_address")
        device_params["ip_address"] = node_updates["ip_address"]
    if "name" in node_updates:
        device_set.append("name = :name")
        device_params["name"] = node_updates["name"]
    if device_set:
        await db.execute(text(
            f"UPDATE devices SET {', '.join(device_set)} WHERE id = (SELECT device_id FROM dmx_nodes WHERE id = :node_id)"
        ), device_params)

    await db.commit()

    result = await db.execute(text("""
        SELECT n.*, d.hardware_id, d.last_seen
        FROM dmx_nodes n LEFT JOIN devices d ON d.id = n.device_id
        WHERE n.id = :id
    """), {"id": str(node_id)})
    return _row_to_node(result.fetchone())


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete an Art-Net node. Fails if fixtures are still assigned to it."""
    result = await db.execute(
        text("SELECT COUNT(*) FROM dmx_fixtures WHERE node_id = :id"), {"id": str(node_id)}
    )
    count = result.scalar()
    if count and count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete node: {count} fixture(s) still assigned. Delete fixtures first.",
        )

    result = await db.execute(
        text("DELETE FROM dmx_nodes WHERE id = :id RETURNING id"), {"id": str(node_id)}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX node not found")
    await db.commit()
    return {"status": "deleted", "id": str(node_id)}


# =============================================================================
# DMX Fixture Endpoints
# =============================================================================

@router.get("/fixtures")
async def list_fixtures(
    node_id: Optional[UUID] = None,
    entity_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List DMX fixtures.
    - Filter by node: ?node_id=<uuid>
    - Filter by linked entity: ?entity_id=<uuid>
    """
    conditions = []
    params: Dict[str, Any] = {}

    if node_id:
        conditions.append("node_id = :node_id")
        params["node_id"] = str(node_id)
    if entity_id:
        conditions.append("entity_id = :entity_id")
        params["entity_id"] = str(entity_id)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    result = await db.execute(
        text(f"{_FIXTURE_SELECT} {where} ORDER BY f.universe ASC, f.sort_order ASC, f.created_at ASC"),
        params,
    )
    return [_row_to_fixture(r) for r in result.fetchall()]


@router.post("/fixtures", status_code=201)
async def create_fixture(data: DMXFixtureCreate, db: AsyncSession = Depends(get_db)):
    """
    Create a new DMX fixture and place it on the canvas.

    If entity_id is provided, validates the entity exists before linking.
    If ofl_fixture_id is provided, the channel_map is auto-populated from the
    OFL fixture's mode channels (matching fixture_mode, or first mode if unset).
    On delete of the linked entity, entity_id is automatically set to NULL
    (handled by the database FK: ON DELETE SET NULL).
    """
    await _require_node(data.node_id, db)

    if data.entity_id:
        await _require_entity(data.entity_id, db)

    # Build channel_map from OFL if ofl_fixture_id is provided and no manual map given
    resolved_channel_map = {k: v.model_dump() for k, v in data.channel_map.items()}
    if data.ofl_fixture_id and not resolved_channel_map:
        ofl_map = await _build_channel_map_from_ofl(data.ofl_fixture_id, data.fixture_mode, db)
        if ofl_map:
            resolved_channel_map = ofl_map

    fixture_id = str(uuid4())
    channel_map_json = json.dumps(resolved_channel_map)
    metadata_json = json.dumps(data.metadata)

    await db.execute(text("""
        INSERT INTO dmx_fixtures (
            id, name, label, node_id, universe,
            start_channel, channel_count, fixture_mode, channel_map,
            entity_id, ofl_fixture_id, position_x, position_y, sort_order, metadata
        ) VALUES (
            :id, :name, :label, :node_id, :universe,
            :start_channel, :channel_count, :fixture_mode, CAST(:channel_map AS jsonb),
            :entity_id, :ofl_fixture_id, :position_x, :position_y,
            COALESCE((SELECT MAX(sort_order) + 1 FROM dmx_fixtures), 0),
            CAST(:metadata AS jsonb)
        )
    """), {
        "id": fixture_id,
        "name": data.name,
        "label": data.label,
        "node_id": str(data.node_id),
        "universe": data.universe,
        "start_channel": data.start_channel,
        "channel_count": data.channel_count,
        "fixture_mode": data.fixture_mode,
        "channel_map": channel_map_json,
        "entity_id": str(data.entity_id) if data.entity_id else None,
        "ofl_fixture_id": data.ofl_fixture_id if data.ofl_fixture_id else None,
        "position_x": data.position_x,
        "position_y": data.position_y,
        "metadata": metadata_json,
    })
    await db.commit()

    result = await db.execute(
        text(f"{_FIXTURE_SELECT} WHERE f.id = :id"), {"id": fixture_id}
    )
    return _row_to_fixture(result.fetchone())


@router.put("/fixtures/reorder")
async def reorder_fixtures(ids: List[str], db: AsyncSession = Depends(get_db)):
    """Persist a new fixture order by assigning sort_order = array index."""
    for i, fixture_id in enumerate(ids):
        await db.execute(text(
            "UPDATE dmx_fixtures SET sort_order = :order WHERE id = :id"
        ), {"order": i, "id": fixture_id})
    await db.commit()
    return {"reordered": len(ids)}


@router.get("/fixtures/{fixture_id}")
async def get_fixture(fixture_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single DMX fixture by ID."""
    result = await db.execute(
        text(f"{_FIXTURE_SELECT} WHERE f.id = :id"), {"id": str(fixture_id)}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="DMX fixture not found")
    return _row_to_fixture(row)


@router.put("/fixtures/{fixture_id}")
async def update_fixture(
    fixture_id: UUID,
    data: DMXFixtureUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a DMX fixture (config, entity link, position, channel map).

    To unlink from an entity, explicitly pass "entity_id": null.
    Omitting entity_id from the request body leaves the existing link unchanged.
    """
    result = await db.execute(
        text("SELECT id FROM dmx_fixtures WHERE id = :id"), {"id": str(fixture_id)}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX fixture not found")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        result = await db.execute(
            text(f"{_FIXTURE_SELECT} WHERE f.id = :id"), {"id": str(fixture_id)}
        )
        return _row_to_fixture(result.fetchone())

    # Validate entity exists if a non-null entity_id is being set
    if "entity_id" in updates and updates["entity_id"] is not None:
        await _require_entity(updates["entity_id"], db)

    # Validate new node exists if node_id is being changed
    if "node_id" in updates and updates["node_id"] is not None:
        await _require_node(updates["node_id"], db)

    set_clauses = []
    params: Dict[str, Any] = {"id": str(fixture_id)}
    for key, value in updates.items():
        if key == "channel_map":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(
                {k: (v if isinstance(v, dict) else v.model_dump()) for k, v in value.items()}
            )
        elif key == "metadata":
            set_clauses.append(f"{key} = CAST(:{key} AS jsonb)")
            params[key] = json.dumps(value)
        elif key in ("entity_id", "node_id") and value is not None:
            # UUID fields — store as string; None passes through as NULL below
            set_clauses.append(f"{key} = :{key}")
            params[key] = str(value)
        else:
            # Handles None (→ NULL) for entity_id unlinking, and scalar fields
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    await db.execute(text(
        f"UPDATE dmx_fixtures SET {', '.join(set_clauses)} WHERE id = :id"
    ), params)
    await db.commit()

    result = await db.execute(
        text(f"{_FIXTURE_SELECT} WHERE f.id = :id"), {"id": str(fixture_id)}
    )
    return _row_to_fixture(result.fetchone())


@router.delete("/fixtures/{fixture_id}")
async def delete_fixture(fixture_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a DMX fixture from the canvas."""
    result = await db.execute(
        text("DELETE FROM dmx_fixtures WHERE id = :id RETURNING id"), {"id": str(fixture_id)}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="DMX fixture not found")
    await db.commit()
    return {"status": "deleted", "id": str(fixture_id)}


@router.put("/fixtures/positions/bulk")
async def bulk_update_positions(
    positions: List[FixturePositionUpdate],
    db: AsyncSession = Depends(get_db),
):
    """Bulk update fixture canvas positions after a drag operation."""
    for pos in positions:
        await db.execute(text(
            "UPDATE dmx_fixtures SET position_x = :x, position_y = :y WHERE id = :id"
        ), {"id": str(pos.id), "x": pos.position_x, "y": pos.position_y})
    await db.commit()
    return {"status": "updated", "count": len(positions)}


# =============================================================================
# Reverse Lookup — Entity → Fixture
# =============================================================================

@router.get("/entities/{entity_id}/fixture")
async def get_fixture_by_entity(entity_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Get the DMX fixture linked to a specific Maestra entity.

    Returns 404 if the entity exists but has no linked fixture.
    Useful for the entities UI to show DMX context without fetching all fixtures.
    """
    await _require_entity(entity_id, db)

    result = await db.execute(
        text(f"{_FIXTURE_SELECT} WHERE f.entity_id = :entity_id LIMIT 1"),
        {"entity_id": str(entity_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"No DMX fixture is linked to entity '{entity_id}'.",
        )
    return _row_to_fixture(row)


# =============================================================================
# DMX Output Pause / Resume
# =============================================================================

async def _set_pause(paused: bool) -> None:
    """Persist pause state to Redis and notify the DMX gateway via NATS."""
    redis = get_redis()
    if redis:
        if paused:
            await redis.set(DMX_PAUSE_KEY, "1")
        else:
            await redis.delete(DMX_PAUSE_KEY)

    if state_manager.nc:
        import json as _json
        payload = _json.dumps({"action": "pause" if paused else "resume"}).encode()
        await state_manager.nc.publish(DMX_CONTROL_SUBJECT, payload)


@router.get("/pause-state")
async def get_pause_state():
    """Return whether DMX output is currently paused."""
    redis = get_redis()
    paused = False
    if redis:
        val = await redis.get(DMX_PAUSE_KEY)
        paused = val is not None
    return {"paused": paused}


@router.post("/pause")
async def pause_dmx_output():
    """
    Pause DMX output from external sources.
    Only signals from source='dashboard-dmx' will be forwarded to fixtures.
    """
    await _set_pause(True)
    return {"paused": True}


@router.post("/resume")
async def resume_dmx_output():
    """Resume normal DMX output — all entity state sources are forwarded again."""
    await _set_pause(False)
    return {"paused": False}


@router.post("/clear")
async def clear_dmx_output(db: AsyncSession = Depends(get_db)):
    """
    Zero all DMX output:
    1. Update entity state to all-zeros in the database for every linked fixture,
       then broadcast via state_manager so the DMX gateway re-sends via entity path.
    2. Also send raw Art-Net all-zeros for every configured universe as immediate backup.
    """
    import json as _json
    from database import EntityDB, EntityTypeDB
    from sqlalchemy import select as sa_select
    from datetime import datetime

    # ── Step 1: zero entity states for all fixtures that have an entity + channel_map ──

    fixture_rows = await db.execute(text("""
        SELECT f.id, f.entity_id, f.channel_map
        FROM dmx_fixtures f
        WHERE f.entity_id IS NOT NULL AND f.channel_map IS NOT NULL
    """))
    fixtures_with_entities = fixture_rows.fetchall()

    entity_ids = [r.entity_id for r in fixtures_with_entities if r.entity_id]
    entities_updated = 0

    if entity_ids:
        entity_result = await db.execute(
            sa_select(EntityDB, EntityTypeDB)
            .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
            .where(EntityDB.id.in_(entity_ids))
        )
        entity_map = {str(row.EntityDB.id): (row.EntityDB, row.EntityTypeDB) for row in entity_result}

        for fx_row in fixtures_with_entities:
            if not fx_row.entity_id:
                continue
            entry = entity_map.get(str(fx_row.entity_id))
            if not entry:
                continue
            db_entity, entity_type = entry

            channel_map = fx_row.channel_map or {}
            zero_state: dict[str, int] = {key: 0 for key in channel_map}
            if not zero_state:
                continue

            previous_state = db_entity.state or {}
            db_entity.state = zero_state
            db_entity.state_updated_at = datetime.utcnow()

            await state_manager.broadcast_state_change(
                entity_id=db_entity.id,
                entity_slug=db_entity.slug,
                entity_type=entity_type.name,
                entity_path=db_entity.path,
                previous_state=previous_state,
                new_state=zero_state,
                source="dashboard-dmx",
                entity_metadata=db_entity.entity_metadata,
            )
            entities_updated += 1

        await db.commit()

    # ── Step 2: raw Art-Net universe zeros (belt-and-suspenders) ──────────────

    if not state_manager.nc:
        return {"cleared_entities": entities_updated, "cleared_universes": 0}

    universe_rows = await db.execute(text("""
        SELECT DISTINCT f.node_id, f.universe FROM dmx_fixtures f
    """))
    fixture_universes = universe_rows.fetchall()

    artnet_universes: set[int] = set()
    if fixture_universes:
        node_ids = list({r.node_id for r in fixture_universes})
        node_rows = await db.execute(text("""
            SELECT id, universes FROM dmx_nodes WHERE id = ANY(:ids)
        """), {"ids": node_ids})

        node_universe_map: dict[str, dict[int, int]] = {}
        for nr in node_rows.fetchall():
            universes_cfg = nr.universes or []
            mapping = {}
            for uc in universes_cfg:
                if isinstance(uc, dict):
                    mapping[uc.get("id", 0)] = uc.get("artnet_universe", 0)
            node_universe_map[nr.id] = mapping

        for row in fixture_universes:
            node_map = node_universe_map.get(row.node_id, {})
            artnet_u = node_map.get(row.universe, row.universe)
            artnet_universes.add(artnet_u)

        zeros_payload = _json.dumps({"channels": [0] * 512}).encode()
        for artnet_u in artnet_universes:
            await state_manager.nc.publish(f"maestra.to_artnet.universe.{artnet_u}", zeros_payload)

    return {
        "cleared_entities": entities_updated,
        "cleared_universes": len(artnet_universes),
        "universes": sorted(artnet_universes),
    }


# =============================================================================
# DMX Cues
# =============================================================================

class DMXCueCreate(BaseModel):
    name: str

class DMXCueRename(BaseModel):
    name: str


def _row_to_cue(row) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "fade_duration": float(getattr(row, "fade_duration", 0) or 0),
        "sort_order": getattr(row, "sort_order", 0),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/cues")
async def list_cues(db: AsyncSession = Depends(get_db)):
    """List all saved cues ordered by sort_order, then created_at."""
    rows = await db.execute(text("""
        SELECT id, name, fade_duration, sort_order, created_at, updated_at
        FROM dmx_cues ORDER BY sort_order ASC, created_at ASC
    """))
    return [_row_to_cue(r) for r in rows.fetchall()]


@router.post("/cues")
async def save_cue(data: DMXCueCreate, db: AsyncSession = Depends(get_db)):
    """Snapshot current entity states for all linked fixtures into a new named cue."""
    # Collect all fixtures with a linked entity and a channel map
    fixture_rows = await db.execute(text("""
        SELECT f.id, f.entity_id, f.channel_map
        FROM dmx_fixtures f
        WHERE f.entity_id IS NOT NULL
          AND f.channel_map IS NOT NULL
          AND f.channel_map != '{}'::jsonb
    """))
    fixtures = fixture_rows.fetchall()

    # Fetch current entity states in one query
    entity_ids = [r.entity_id for r in fixtures]
    entity_state_map: dict[str, dict] = {}
    if entity_ids:
        entity_rows = await db.execute(text("""
            SELECT id, state FROM entities WHERE id = ANY(:ids)
        """), {"ids": entity_ids})
        for er in entity_rows.fetchall():
            entity_state_map[str(er.id)] = er.state or {}

    # Create cue header
    cue_row = await db.execute(text("""
        INSERT INTO dmx_cues (name) VALUES (:name)
        RETURNING id, name, created_at, updated_at
    """), {"name": data.name})
    cue = cue_row.fetchone()

    import json as _json

    # Insert per-fixture snapshot rows
    for fx in fixtures:
        entity_state = entity_state_map.get(str(fx.entity_id), {})
        channel_map = fx.channel_map or {}
        # Only snapshot keys that belong to the channel map
        state_snapshot = {k: (entity_state.get(k) or 0) for k in channel_map.keys()}
        await db.execute(text("""
            INSERT INTO dmx_cue_fixtures (cue_id, fixture_id, entity_id, state)
            VALUES (:cue_id, :fixture_id, :entity_id, CAST(:state AS jsonb))
        """), {
            "cue_id": str(cue.id),
            "fixture_id": str(fx.id),
            "entity_id": str(fx.entity_id),
            "state": _json.dumps(state_snapshot),
        })

    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return _row_to_cue(cue)


@router.post("/cues/{cue_id}/recall")
async def recall_cue(cue_id: UUID, db: AsyncSession = Depends(get_db)):
    """Restore all fixture entity states from a saved cue snapshot."""
    from database import EntityDB, EntityTypeDB
    from sqlalchemy import select as sa_select
    from datetime import datetime

    # Load cue fixture snapshot rows
    snap_rows = await db.execute(text("""
        SELECT entity_id, state FROM dmx_cue_fixtures WHERE cue_id = :cue_id
    """), {"cue_id": str(cue_id)})
    snapshots = snap_rows.fetchall()

    if not snapshots:
        # Still valid — cue may have been saved with no linked fixtures
        cue_row = await db.execute(text("SELECT name FROM dmx_cues WHERE id = :id"), {"id": str(cue_id)})
        cue = cue_row.fetchone()
        if not cue:
            raise HTTPException(status_code=404, detail="Cue not found")
        return {"recalled": 0, "skipped": 0, "cue_id": str(cue_id), "cue_name": cue.name}

    entity_ids = [r.entity_id for r in snapshots]

    entity_result = await db.execute(
        sa_select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id.in_(entity_ids))
    )
    entity_map = {str(row.EntityDB.id): (row.EntityDB, row.EntityTypeDB) for row in entity_result}

    recalled = 0
    skipped = 0

    for snap in snapshots:
        entry = entity_map.get(str(snap.entity_id))
        if not entry:
            skipped += 1
            continue

        db_entity, entity_type = entry
        new_state = dict(snap.state) if snap.state else {}
        previous_state = db_entity.state or {}

        db_entity.state = new_state
        db_entity.state_updated_at = datetime.utcnow()

        await state_manager.broadcast_state_change(
            entity_id=db_entity.id,
            entity_slug=db_entity.slug,
            entity_type=entity_type.name,
            entity_path=db_entity.path,
            previous_state=previous_state,
            new_state=new_state,
            source="dashboard-dmx",
            entity_metadata=db_entity.entity_metadata,
        )
        recalled += 1

    await db.commit()

    cue_row = await db.execute(text("SELECT name FROM dmx_cues WHERE id = :id"), {"id": str(cue_id)})
    cue = cue_row.fetchone()

    return {
        "recalled": recalled,
        "skipped": skipped,
        "cue_id": str(cue_id),
        "cue_name": cue.name if cue else "",
    }


@router.put("/cues/reorder")
async def reorder_cues(ids: List[str], db: AsyncSession = Depends(get_db)):
    """Persist a new cue order by assigning sort_order = array index."""
    for i, cue_id in enumerate(ids):
        await db.execute(text("""
            UPDATE dmx_cues SET sort_order = :order WHERE id = :id
        """), {"order": i, "id": cue_id})
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return {"reordered": len(ids)}


@router.post("/cues/{cue_id}/snapshot")
async def update_cue_snapshot(cue_id: UUID, db: AsyncSession = Depends(get_db)):
    """Replace a cue's fixture snapshot with current entity states (for Edit Mode save)."""
    import json as _json

    # Verify cue exists
    cue_check = await db.execute(text("""
        SELECT id, name, fade_duration, sort_order, created_at, updated_at FROM dmx_cues WHERE id = :id
    """), {"id": str(cue_id)})
    cue = cue_check.fetchone()
    if not cue:
        raise HTTPException(status_code=404, detail="Cue not found")

    # Re-snapshot current entity states (same logic as save_cue)
    fixture_rows = await db.execute(text("""
        SELECT f.id, f.entity_id, f.channel_map
        FROM dmx_fixtures f
        WHERE f.entity_id IS NOT NULL
          AND f.channel_map IS NOT NULL
          AND f.channel_map != '{}'::jsonb
    """))
    fixtures = fixture_rows.fetchall()

    entity_ids = [r.entity_id for r in fixtures]
    entity_state_map: dict[str, dict] = {}
    if entity_ids:
        entity_rows = await db.execute(text("""
            SELECT id, state FROM entities WHERE id = ANY(:ids)
        """), {"ids": entity_ids})
        for er in entity_rows.fetchall():
            entity_state_map[str(er.id)] = er.state or {}

    # Replace existing fixture rows
    await db.execute(text("DELETE FROM dmx_cue_fixtures WHERE cue_id = :cue_id"), {"cue_id": str(cue_id)})

    for fx in fixtures:
        entity_state = entity_state_map.get(str(fx.entity_id), {})
        channel_map = fx.channel_map or {}
        state_snapshot = {k: (entity_state.get(k) or 0) for k in channel_map.keys()}
        await db.execute(text("""
            INSERT INTO dmx_cue_fixtures (cue_id, fixture_id, entity_id, state)
            VALUES (:cue_id, :fixture_id, :entity_id, CAST(:state AS jsonb))
        """), {
            "cue_id": str(cue_id),
            "fixture_id": str(fx.id),
            "entity_id": str(fx.entity_id),
            "state": _json.dumps(state_snapshot),
        })

    await db.execute(text("""
        UPDATE dmx_cues SET updated_at = NOW() WHERE id = :id
    """), {"id": str(cue_id)})

    await db.commit()

    updated = await db.execute(text("""
        SELECT id, name, fade_duration, sort_order, created_at, updated_at FROM dmx_cues WHERE id = :id
    """), {"id": str(cue_id)})
    return _row_to_cue(updated.fetchone())


@router.put("/cues/{cue_id}")
async def rename_cue(cue_id: UUID, data: DMXCueRename, db: AsyncSession = Depends(get_db)):
    """Rename a cue."""
    row = await db.execute(text("""
        UPDATE dmx_cues SET name = :name WHERE id = :id
        RETURNING id, name, fade_duration, sort_order, created_at, updated_at
    """), {"name": data.name, "id": str(cue_id)})
    cue = row.fetchone()
    if not cue:
        raise HTTPException(status_code=404, detail="Cue not found")
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return _row_to_cue(cue)


@router.delete("/cues/{cue_id}")
async def delete_cue(cue_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a cue and all its fixture snapshot rows (cascaded)."""
    row = await db.execute(text("""
        DELETE FROM dmx_cues WHERE id = :id RETURNING id
    """), {"id": str(cue_id)})
    deleted = row.fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail="Cue not found")
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return {"status": "deleted", "id": str(cue_id)}


# Endpoint to fetch cue fixture snapshots for playback
@router.get("/cues/{cue_id}/fixtures")
async def get_cue_fixtures(cue_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return all fixture snapshots for a cue (used by sequence playback)."""
    rows = await db.execute(text("""
        SELECT fixture_id, entity_id, state
        FROM dmx_cue_fixtures WHERE cue_id = :cue_id
    """), {"cue_id": str(cue_id)})
    return [
        {"fixture_id": str(r.fixture_id), "entity_id": str(r.entity_id), "state": r.state or {}}
        for r in rows.fetchall()
    ]


# =============================================================================
# DMX Sequences
# =============================================================================

class DMXSequenceCreate(BaseModel):
    name: str

class DMXSequenceRename(BaseModel):
    name: str

class DMXSequenceCuePlacementCreate(BaseModel):
    cue_id: str

class DMXSequenceCuePlacementUpdate(BaseModel):
    transition_time: Optional[float] = None
    hold_duration: Optional[float] = None


def _placements_for_sequence(sequence_id: str, rows) -> list:
    return [
        {
            "id": str(r.id),
            "sequence_id": sequence_id,
            "cue_id": str(r.cue_id),
            "cue_name": r.cue_name or "",
            "position": r.position,
            "transition_time": r.transition_time,
            "hold_duration": r.hold_duration,
        }
        for r in rows
    ]


async def _load_placements(sequence_id: str, db: AsyncSession) -> list:
    rows = await db.execute(text("""
        SELECT sc.id, sc.cue_id, c.name AS cue_name, sc.position,
               sc.transition_time, sc.hold_duration
        FROM dmx_sequence_cues sc
        JOIN dmx_cues c ON c.id = sc.cue_id
        WHERE sc.sequence_id = :sid
        ORDER BY sc.position ASC
    """), {"sid": sequence_id})
    return _placements_for_sequence(sequence_id, rows.fetchall())


def _row_to_sequence(row, placements: list) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "fade_out_duration": float(getattr(row, "fade_out_duration", 3) or 3),
        "sort_order": getattr(row, "sort_order", 0),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "cue_placements": placements,
    }


@router.get("/sequences")
async def list_sequences(db: AsyncSession = Depends(get_db)):
    """List all sequences with their cue placements, ordered by sort_order."""
    seq_rows = await db.execute(text("""
        SELECT id, name, fade_out_duration, sort_order, created_at, updated_at
        FROM dmx_sequences ORDER BY sort_order ASC, created_at ASC
    """))
    sequences = seq_rows.fetchall()
    result = []
    for s in sequences:
        placements = await _load_placements(str(s.id), db)
        result.append(_row_to_sequence(s, placements))
    return result


@router.post("/sequences")
async def create_sequence(data: DMXSequenceCreate, db: AsyncSession = Depends(get_db)):
    """Create a new empty sequence."""
    # Assign sort_order = max + 1
    max_row = await db.execute(text("SELECT COALESCE(MAX(sort_order), -1) AS m FROM dmx_sequences"))
    next_order = (max_row.fetchone().m or 0) + 1

    row = await db.execute(text("""
        INSERT INTO dmx_sequences (name, sort_order)
        VALUES (:name, :sort_order)
        RETURNING id, name, fade_out_duration, sort_order, created_at, updated_at
    """), {"name": data.name, "sort_order": next_order})
    seq = row.fetchone()
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return _row_to_sequence(seq, [])


@router.put("/sequences/reorder")
async def reorder_sequences(ids: List[str], db: AsyncSession = Depends(get_db)):
    """Persist sequence order by assigning sort_order = array index."""
    for i, seq_id in enumerate(ids):
        await db.execute(text("""
            UPDATE dmx_sequences SET sort_order = :order WHERE id = :id
        """), {"order": i, "id": seq_id})
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return {"reordered": len(ids)}


@router.put("/sequences/{sequence_id}")
async def rename_sequence(sequence_id: UUID, data: DMXSequenceRename, db: AsyncSession = Depends(get_db)):
    """Rename a sequence."""
    row = await db.execute(text("""
        UPDATE dmx_sequences SET name = :name WHERE id = :id
        RETURNING id, name, fade_out_duration, sort_order, created_at, updated_at
    """), {"name": data.name, "id": str(sequence_id)})
    seq = row.fetchone()
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    placements = await _load_placements(str(sequence_id), db)
    return _row_to_sequence(seq, placements)


@router.delete("/sequences/{sequence_id}")
async def delete_sequence(sequence_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a sequence (cascade removes cue placements)."""
    row = await db.execute(text("""
        DELETE FROM dmx_sequences WHERE id = :id RETURNING id
    """), {"id": str(sequence_id)})
    deleted = row.fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail="Sequence not found")
    await _sync_dmx_lighting_entity(db)
    await db.commit()
    return {"status": "deleted", "id": str(sequence_id)}


@router.post("/sequences/{sequence_id}/cues")
async def add_cue_to_sequence(
    sequence_id: UUID,
    data: DMXSequenceCuePlacementCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a cue to a sequence at the end."""
    # Verify sequence and cue exist
    seq_check = await db.execute(text("SELECT id FROM dmx_sequences WHERE id = :id"), {"id": str(sequence_id)})
    if not seq_check.fetchone():
        raise HTTPException(status_code=404, detail="Sequence not found")
    cue_check = await db.execute(text("SELECT id FROM dmx_cues WHERE id = :id"), {"id": data.cue_id})
    if not cue_check.fetchone():
        raise HTTPException(status_code=404, detail="Cue not found")

    max_pos = await db.execute(text("""
        SELECT COALESCE(MAX(position), -1) AS m FROM dmx_sequence_cues WHERE sequence_id = :sid
    """), {"sid": str(sequence_id)})
    next_pos = (max_pos.fetchone().m or 0) + 1

    await db.execute(text("""
        INSERT INTO dmx_sequence_cues (sequence_id, cue_id, position)
        VALUES (:sid, :cue_id, :pos)
    """), {"sid": str(sequence_id), "cue_id": data.cue_id, "pos": next_pos})

    await db.execute(text("""
        UPDATE dmx_sequences SET updated_at = NOW() WHERE id = :id
    """), {"id": str(sequence_id)})
    await _sync_dmx_lighting_entity(db)
    await db.commit()

    placements = await _load_placements(str(sequence_id), db)
    return placements


@router.put("/sequences/{sequence_id}/cues/reorder")
async def reorder_sequence_cues(
    sequence_id: UUID,
    ids: List[str],
    db: AsyncSession = Depends(get_db),
):
    """Reorder cue placements within a sequence by assigning position = array index."""
    for i, placement_id in enumerate(ids):
        await db.execute(text("""
            UPDATE dmx_sequence_cues SET position = :pos
            WHERE id = :id AND sequence_id = :sid
        """), {"pos": i, "id": placement_id, "sid": str(sequence_id)})
    await db.execute(text("""
        UPDATE dmx_sequences SET updated_at = NOW() WHERE id = :id
    """), {"id": str(sequence_id)})
    await db.commit()
    return {"reordered": len(ids)}


@router.put("/sequences/{sequence_id}/cues/{placement_id}")
async def update_cue_placement(
    sequence_id: UUID,
    placement_id: UUID,
    data: DMXSequenceCuePlacementUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update transition_time and/or hold_duration for a cue placement."""
    sets = []
    params: dict = {"id": str(placement_id), "sid": str(sequence_id)}
    if data.transition_time is not None:
        sets.append("transition_time = :transition_time")
        params["transition_time"] = data.transition_time
    if data.hold_duration is not None:
        sets.append("hold_duration = :hold_duration")
        params["hold_duration"] = data.hold_duration
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.execute(text(f"""
        UPDATE dmx_sequence_cues SET {', '.join(sets)}
        WHERE id = :id AND sequence_id = :sid
    """), params)
    await db.execute(text("""
        UPDATE dmx_sequences SET updated_at = NOW() WHERE id = :id
    """), {"id": str(sequence_id)})
    await db.commit()

    placements = await _load_placements(str(sequence_id), db)
    return placements


@router.delete("/sequences/{sequence_id}/cues/{placement_id}")
async def remove_cue_from_sequence(
    sequence_id: UUID,
    placement_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove a cue placement from a sequence (does not delete the cue itself)."""
    row = await db.execute(text("""
        DELETE FROM dmx_sequence_cues
        WHERE id = :id AND sequence_id = :sid
        RETURNING id
    """), {"id": str(placement_id), "sid": str(sequence_id)})
    if not row.fetchone():
        raise HTTPException(status_code=404, detail="Placement not found")
    await db.execute(text("""
        UPDATE dmx_sequences SET updated_at = NOW() WHERE id = :id
    """), {"id": str(sequence_id)})
    await _sync_dmx_lighting_entity(db)
    await db.commit()

    placements = await _load_placements(str(sequence_id), db)
    return placements


# =============================================================================
# Playback Engine Endpoints
# =============================================================================

class PlaybackPlayRequest(BaseModel):
    sequence_id: str


class PlaybackFadeOutRequest(BaseModel):
    duration_ms: float = 3000.0


class PlaybackCueFadeRequest(BaseModel):
    from_cue_id: Optional[str] = None
    to_cue_id: str
    duration_ms: float = 0.0


@router.get("/playback/status")
async def get_playback_status():
    """Return current playback engine status."""
    from dmx_playback_engine import playback_engine
    return playback_engine.status


@router.get("/playback/config")
async def get_playback_config():
    """Return current playback engine configuration."""
    from dmx_playback_engine import playback_engine
    return {"interval_ms": round(playback_engine._send_interval * 1000)}


class PlaybackConfigUpdate(BaseModel):
    interval_ms: float


@router.put("/playback/config")
async def update_playback_config(data: PlaybackConfigUpdate):
    """Update playback engine configuration at runtime and persist it."""
    from dmx_playback_engine import playback_engine
    await playback_engine.set_interval(data.interval_ms)
    return {"interval_ms": round(playback_engine._send_interval * 1000)}


@router.post("/playback/play")
async def playback_play(data: PlaybackPlayRequest):
    """Start sequence playback."""
    from dmx_playback_engine import playback_engine
    ok = await playback_engine.play(data.sequence_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Sequence not found or has no cue placements")
    return {"status": "playing"}


@router.post("/playback/pause")
async def playback_pause():
    """Pause playback."""
    from dmx_playback_engine import playback_engine
    await playback_engine.pause()
    return {"status": "paused"}


@router.post("/playback/resume")
async def playback_resume():
    """Resume paused playback."""
    from dmx_playback_engine import playback_engine
    await playback_engine.resume()
    return {"status": "playing"}


@router.post("/playback/stop")
async def playback_stop():
    """Stop playback."""
    from dmx_playback_engine import playback_engine
    await playback_engine.stop()
    return {"status": "stopped"}


@router.post("/playback/toggle-loop")
async def playback_toggle_loop():
    """Toggle loop mode."""
    from dmx_playback_engine import playback_engine
    loop = await playback_engine.toggle_loop()
    return {"loop": loop}


@router.post("/playback/fadeout")
async def playback_fadeout(data: PlaybackFadeOutRequest):
    """Fade out dimmer channels of the current cue then stop."""
    from dmx_playback_engine import playback_engine
    await playback_engine.fade_out(data.duration_ms)
    return {"status": "fading_out"}


@router.post("/playback/cue-fade")
async def playback_cue_fade(data: PlaybackCueFadeRequest):
    """Fade from one cue snapshot to another."""
    from dmx_playback_engine import playback_engine
    ok = await playback_engine.recall_cue_fade(
        data.from_cue_id, data.to_cue_id, data.duration_ms
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Target cue has no fixture snapshots")
    return {"status": "fading"}


@router.post("/playback/blackout")
async def playback_blackout(db: AsyncSession = Depends(get_db)):
    """Immediately zero all channels on every fixture — sends raw Art-Net zeros to every universe."""
    import json as _json
    from state_manager import state_manager

    # Step 1: zero entity states in DB for all linked fixtures
    fixture_rows = await db.execute(text("""
        SELECT entity_id, channel_map FROM dmx_fixtures
        WHERE entity_id IS NOT NULL
    """))
    fixtures = fixture_rows.fetchall()

    for row in fixtures:
        channel_map = row.channel_map or {}
        zero_state = {}
        for key, ch in channel_map.items():
            ch_type = ch.get('type', 'range') if isinstance(ch, dict) else 'range'
            if ch_type == 'boolean':
                zero_state[key] = False
            elif ch_type == 'number':
                zero_state[key] = 0
            else:
                zero_state[key] = 0.0

        await db.execute(text("""
            UPDATE entities
            SET state = CAST(:state AS jsonb), state_updated_at = NOW()
            WHERE id = :entity_id
        """), {"state": _json.dumps(zero_state), "entity_id": row.entity_id})

    await db.commit()

    # Step 2: send raw 512-zero Art-Net packets to every configured universe on every node
    cleared_universes = 0
    if state_manager.nc:
        universe_rows = await db.execute(text("""
            SELECT DISTINCT f.node_id, f.universe FROM dmx_fixtures f
        """))
        fixture_universes = universe_rows.fetchall()

        if fixture_universes:
            node_ids = list({r.node_id for r in fixture_universes})
            node_rows = await db.execute(text("""
                SELECT id, universes FROM dmx_nodes WHERE id = ANY(:ids)
            """), {"ids": node_ids})

            node_universe_map: dict[str, dict[int, int]] = {}
            for nr in node_rows.fetchall():
                universes_cfg = nr.universes or []
                mapping = {}
                for uc in universes_cfg:
                    if isinstance(uc, dict):
                        mapping[uc.get("id", 0)] = uc.get("artnet_universe", 0)
                node_universe_map[nr.id] = mapping

            artnet_universes: set[int] = set()
            for row in fixture_universes:
                node_map = node_universe_map.get(row.node_id, {})
                artnet_u = node_map.get(row.universe, row.universe)
                artnet_universes.add(artnet_u)

            zeros_payload = _json.dumps({"channels": [0] * 512}).encode()
            for artnet_u in artnet_universes:
                await state_manager.nc.publish(f"maestra.to_artnet.universe.{artnet_u}", zeros_payload)

            cleared_universes = len(artnet_universes)

    return {"status": "blackout", "fixtures": len(fixtures), "universes": cleared_universes}
