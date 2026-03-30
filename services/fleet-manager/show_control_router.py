"""
Maestra Show Control Router
System-wide show lifecycle management with state machine validation,
configurable side effects, and schedule CRUD.

Show Control State Machine
─────────────────────────────────────────────────────
  idle ──→ pre_show ──→ active ──→ post_show ──→ idle
                          │  ▲
                          ▼  │
                        paused

  ANY ──→ shutdown ──→ idle (manual only)

  Invalid: idle→active, idle→paused, post_show→active
─────────────────────────────────────────────────────
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timezone
import asyncio
import json
import logging
import os

from database import get_db, async_session_maker

logger = logging.getLogger("show_control")

router = APIRouter(prefix="/show", tags=["show-control"])

# =============================================================================
# STATE MACHINE
# =============================================================================

SHOW_PHASES = ['idle', 'pre_show', 'active', 'paused', 'post_show', 'shutdown']

VALID_TRANSITIONS = {
    'idle': ['pre_show'],
    'pre_show': ['active', 'shutdown'],
    'active': ['paused', 'post_show', 'shutdown'],
    'paused': ['active', 'post_show', 'shutdown'],
    'post_show': ['idle', 'shutdown'],
    'shutdown': ['idle'],
}

SHOW_CONTROL_TOKEN = os.getenv("SHOW_CONTROL_TOKEN", "")

# =============================================================================
# MODELS
# =============================================================================

class TransitionRequest(BaseModel):
    to: str
    source: Optional[str] = "api"
    context: Optional[Dict[str, Any]] = None

class ShowState(BaseModel):
    phase: str = "idle"
    previous_phase: Optional[str] = None
    transition_time: Optional[str] = None
    source: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)

class ScheduleEntry(BaseModel):
    cron: str
    transition: str

class ScheduleCreate(BaseModel):
    name: str
    enabled: bool = True
    timezone: str = "UTC"
    entries: List[ScheduleEntry]

class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    timezone: Optional[str] = None
    entries: Optional[List[ScheduleEntry]] = None

class SideEffectCreate(BaseModel):
    from_phase: str
    to_phase: str
    action_type: str
    action_config: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    description: Optional[str] = None
    sort_order: int = 0

class SideEffectUpdate(BaseModel):
    from_phase: Optional[str] = None
    to_phase: Optional[str] = None
    action_type: Optional[str] = None
    action_config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

# =============================================================================
# AUTH HELPER
# =============================================================================

def _check_auth(request: Request):
    """Check optional API key if SHOW_CONTROL_TOKEN is set."""
    if not SHOW_CONTROL_TOKEN:
        return
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Show control requires authorization")
    token = auth[7:]
    if token != SHOW_CONTROL_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid show control token")

# =============================================================================
# CORE: GET/SET SHOW STATE
# =============================================================================

async def _get_or_create_show_entity(db: AsyncSession):
    """Get the show entity, creating it if it doesn't exist."""
    result = await db.execute(text("""
        SELECT e.id, e.slug, e.state, e.path, et.name as entity_type, e.metadata
        FROM entities e
        JOIN entity_types et ON e.entity_type_id = et.id
        WHERE e.slug = 'show'
        FOR UPDATE
    """))
    row = result.first()
    if row:
        return row

    # Auto-create: ensure entity type exists first
    await db.execute(text("""
        INSERT INTO entity_types (name, display_name, description, icon, default_state, metadata)
        VALUES ('show_control', 'Show Control', 'Show lifecycle controller', 'play',
                '{"phase":"idle","previous_phase":null,"transition_time":null,"source":null,"context":{}}',
                '{"singleton": true}')
        ON CONFLICT (name) DO NOTHING
    """))
    await db.execute(text("""
        INSERT INTO entities (name, slug, entity_type_id, path, state, metadata, status)
        VALUES ('Show', 'show',
                (SELECT id FROM entity_types WHERE name = 'show_control'),
                'show',
                '{"phase":"idle","previous_phase":null,"transition_time":null,"source":null,"context":{}}',
                '{"show_control": true, "singleton": true}', 'active')
        ON CONFLICT (slug) DO NOTHING
    """))
    await db.commit()

    result = await db.execute(text("""
        SELECT e.id, e.slug, e.state, e.path, et.name as entity_type, e.metadata
        FROM entities e
        JOIN entity_types et ON e.entity_type_id = et.id
        WHERE e.slug = 'show'
        FOR UPDATE
    """))
    return result.first()


async def _do_transition(from_phase: str, to_phase: str, source: str,
                          context: Optional[Dict[str, Any]], db: AsyncSession):
    """Execute a validated state transition with side effects."""
    from state_manager import state_manager

    entity = await _get_or_create_show_entity(db)
    current_phase = (entity.state or {}).get("phase", "idle")

    # Check no-op
    if current_phase == to_phase:
        raise HTTPException(status_code=400, detail=f"Already in {to_phase} state")

    # Override from_phase with actual current
    from_phase = current_phase

    # Validate transition
    valid = VALID_TRANSITIONS.get(from_phase, [])
    if to_phase not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {from_phase} to {to_phase}. Valid: {valid}"
        )

    now = datetime.now(timezone.utc).isoformat()
    previous_state = dict(entity.state) if entity.state else {}
    new_state = {
        "phase": to_phase,
        "previous_phase": from_phase,
        "transition_time": now,
        "source": source,
        "context": context or {}
    }

    # Update entity state in DB
    await db.execute(text("""
        UPDATE entities SET state = CAST(:state AS jsonb), state_updated_at = NOW()
        WHERE slug = 'show'
    """), {"state": json.dumps(new_state)})

    # Record in entity_states history
    await db.execute(text("""
        INSERT INTO entity_states (entity_id, state, source)
        VALUES (:entity_id, CAST(:state AS jsonb), :source)
    """), {"entity_id": entity.id, "state": json.dumps(new_state), "source": source})

    await db.commit()

    # Broadcast state change via state_manager
    await state_manager.broadcast_state_change(
        entity_id=entity.id,
        entity_slug=entity.slug,
        entity_type=entity.entity_type,
        entity_path=entity.path,
        previous_state=previous_state,
        new_state=new_state,
        source=source,
        entity_metadata=entity.metadata
    )

    # Fire side effects (best-effort, non-blocking)
    asyncio.create_task(_dispatch_side_effects(from_phase, to_phase, db))

    # Publish transition event for monitoring
    if state_manager.nc:
        event = json.dumps({
            "from": from_phase, "to": to_phase,
            "source": source, "timestamp": now
        }).encode()
        await state_manager.nc.publish("maestra.show.transition", event)

    return new_state


# =============================================================================
# SIDE EFFECT DISPATCH
# =============================================================================

# Whitelisted internal functions
INTERNAL_FUNCTIONS = {
    "dmx_blackout": "_call_dmx_blackout",
    "dmx_pause": "_call_dmx_pause",
    "dmx_resume": "_call_dmx_resume",
    "playback_stop": "_call_playback_stop",
}

async def _call_dmx_blackout():
    """Execute DMX blackout (extracted from dmx_router.playback_blackout)."""
    from state_manager import state_manager
    async with async_session_maker() as session:
        fixture_rows = await session.execute(text("""
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
            await session.execute(text("""
                UPDATE entities SET state = CAST(:state AS jsonb), state_updated_at = NOW()
                WHERE id = :entity_id
            """), {"state": json.dumps(zero_state), "entity_id": row.entity_id})
        await session.commit()

        # Send raw Art-Net zeros
        if state_manager.nc:
            universe_rows = await session.execute(text("""
                SELECT DISTINCT f.node_id, f.universe FROM dmx_fixtures f
            """))
            fixture_universes = universe_rows.fetchall()
            if fixture_universes:
                node_ids = list({r.node_id for r in fixture_universes})
                node_rows = await session.execute(text("""
                    SELECT id, universes FROM dmx_nodes WHERE id = ANY(:ids)
                """), {"ids": node_ids})
                node_universe_map = {}
                for nr in node_rows.fetchall():
                    universes_cfg = nr.universes or []
                    mapping = {}
                    for uc in universes_cfg:
                        if isinstance(uc, dict):
                            mapping[uc.get("id", 0)] = uc.get("artnet_universe", 0)
                    node_universe_map[nr.id] = mapping
                artnet_universes = set()
                for row_u in fixture_universes:
                    node_map = node_universe_map.get(row_u.node_id, {})
                    artnet_u = node_map.get(row_u.universe, row_u.universe)
                    artnet_universes.add(artnet_u)
                zeros_payload = json.dumps({"channels": [0] * 512}).encode()
                for artnet_u in artnet_universes:
                    await state_manager.nc.publish(f"maestra.to_artnet.universe.{artnet_u}", zeros_payload)
    logger.info("DMX blackout executed via show control side effect")


async def _call_dmx_pause():
    from dmx_router import _set_pause
    await _set_pause(True)
    logger.info("DMX pause executed via show control side effect")


async def _call_dmx_resume():
    from dmx_router import _set_pause
    await _set_pause(False)
    logger.info("DMX resume executed via show control side effect")


async def _call_playback_stop():
    from dmx_playback_engine import playback_engine
    playback_engine.stop()
    logger.info("Playback stop executed via show control side effect")


async def _dispatch_side_effects(from_phase: str, to_phase: str, db: AsyncSession):
    """Fire configured side effects for a transition. Best-effort, non-blocking."""
    try:
        async with async_session_maker() as session:
            result = await session.execute(text("""
                SELECT action_type, action_config FROM show_side_effects
                WHERE enabled = true
                AND (from_phase = :from_phase OR from_phase = '*')
                AND (to_phase = :to_phase OR to_phase = '*')
                ORDER BY sort_order
            """), {"from_phase": from_phase, "to_phase": to_phase})
            effects = result.fetchall()

        tasks = []
        for effect in effects:
            action_type = effect.action_type
            config = effect.action_config or {}

            if action_type == 'internal_call':
                fn_name = config.get('function', '')
                handler_name = INTERNAL_FUNCTIONS.get(fn_name)
                if handler_name:
                    fn = globals().get(handler_name)
                    if fn:
                        tasks.append(fn())
                    else:
                        logger.warning(f"Side effect function not found: {handler_name}")
                else:
                    logger.warning(f"Unknown internal function: {fn_name}")

            elif action_type == 'nats_publish':
                from state_manager import state_manager
                subject = config.get('subject', '')
                payload = config.get('payload', {})
                if subject and state_manager.nc and subject.startswith('maestra.'):
                    tasks.append(state_manager.nc.publish(
                        subject, json.dumps(payload).encode()
                    ))

            elif action_type == 'entity_state_update':
                from state_manager import state_manager
                target_slug = config.get('slug', '')
                state_update = config.get('state', {})
                if target_slug and state_update:
                    async with async_session_maker() as s:
                        r = await s.execute(text("""
                            SELECT id, slug, state, path, metadata,
                                   (SELECT name FROM entity_types WHERE id = e.entity_type_id) as entity_type
                            FROM entities e WHERE slug = :slug
                        """), {"slug": target_slug})
                        ent = r.first()
                        if ent:
                            prev = dict(ent.state) if ent.state else {}
                            merged = {**prev, **state_update}
                            await s.execute(text("""
                                UPDATE entities SET state = CAST(:state AS jsonb), state_updated_at = NOW()
                                WHERE slug = :slug
                            """), {"state": json.dumps(merged), "slug": target_slug})
                            await s.commit()
                            tasks.append(state_manager.broadcast_state_change(
                                entity_id=ent.id, entity_slug=ent.slug,
                                entity_type=ent.entity_type, entity_path=ent.path,
                                previous_state=prev, new_state=merged,
                                source="show-control-side-effect",
                                entity_metadata=ent.metadata
                            ))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"Side effect {i} failed: {r}")
            logger.info(f"Dispatched {len(tasks)} side effects for {from_phase}->{to_phase}")

    except Exception as e:
        logger.error(f"Side effect dispatch error: {e}")


# =============================================================================
# SHOW CONTROL ENDPOINTS
# =============================================================================

@router.get("/state")
async def get_show_state(db: AsyncSession = Depends(get_db)):
    """Get current show state."""
    entity = await _get_or_create_show_entity(db)
    state = entity.state or {}
    return {
        "phase": state.get("phase", "idle"),
        "previous_phase": state.get("previous_phase"),
        "transition_time": state.get("transition_time"),
        "source": state.get("source"),
        "context": state.get("context", {}),
    }

@router.get("/transitions")
async def get_valid_transitions(db: AsyncSession = Depends(get_db)):
    """Get valid transitions from current state."""
    entity = await _get_or_create_show_entity(db)
    current = (entity.state or {}).get("phase", "idle")
    return {
        "current_phase": current,
        "valid_transitions": VALID_TRANSITIONS.get(current, [])
    }

@router.post("/transition")
async def transition(body: TransitionRequest, request: Request,
                     db: AsyncSession = Depends(get_db)):
    """Execute a show state transition."""
    _check_auth(request)
    new_state = await _do_transition(
        from_phase="",  # will be overridden by current state
        to_phase=body.to,
        source=body.source or "api",
        context=body.context,
        db=db
    )
    return {"status": "ok", "state": new_state}

# Shortcut endpoints
@router.post("/warmup")
async def warmup(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: idle -> pre_show."""
    _check_auth(request)
    new_state = await _do_transition("", "pre_show", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/go")
async def go(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: pre_show -> active."""
    _check_auth(request)
    new_state = await _do_transition("", "active", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/pause")
async def pause_show(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: active -> paused."""
    _check_auth(request)
    new_state = await _do_transition("", "paused", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/resume")
async def resume_show(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: paused -> active."""
    _check_auth(request)
    new_state = await _do_transition("", "active", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/stop")
async def stop_show(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: active|paused -> post_show."""
    _check_auth(request)
    new_state = await _do_transition("", "post_show", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/shutdown")
async def shutdown_show(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: ANY -> shutdown."""
    _check_auth(request)
    new_state = await _do_transition("", "shutdown", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

@router.post("/reset")
async def reset_show(request: Request, db: AsyncSession = Depends(get_db)):
    """Shortcut: shutdown|post_show -> idle."""
    _check_auth(request)
    new_state = await _do_transition("", "idle", "dashboard", None, db)
    return {"status": "ok", "state": new_state}

# =============================================================================
# SHOW HISTORY (entity_states query)
# =============================================================================

@router.get("/history")
async def get_show_history(limit: int = 20, offset: int = 0,
                           db: AsyncSession = Depends(get_db)):
    """Get show transition history from entity_states hypertable."""
    result = await db.execute(text("""
        SELECT es.time, es.state, es.source
        FROM entity_states es
        JOIN entities e ON es.entity_id = e.id
        WHERE e.slug = 'show'
        ORDER BY es.time DESC
        LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": offset})
    rows = result.fetchall()
    return [{
        "time": r.time.isoformat() if r.time else None,
        "state": r.state,
        "source": r.source
    } for r in rows]

# =============================================================================
# SCHEDULE CRUD
# =============================================================================

@router.get("/schedules")
async def list_schedules(db: AsyncSession = Depends(get_db)):
    """List all show schedules."""
    result = await db.execute(text(
        "SELECT * FROM show_schedules ORDER BY created_at"
    ))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]

@router.post("/schedules")
async def create_schedule(body: ScheduleCreate, request: Request,
                          db: AsyncSession = Depends(get_db)):
    """Create a new show schedule."""
    _check_auth(request)
    # Validate transitions in entries
    for entry in body.entries:
        if entry.transition not in SHOW_PHASES:
            raise HTTPException(400, f"Invalid transition target: {entry.transition}")
    result = await db.execute(text("""
        INSERT INTO show_schedules (name, enabled, timezone, entries)
        VALUES (:name, :enabled, :timezone, CAST(:entries AS jsonb))
        RETURNING *
    """), {
        "name": body.name,
        "enabled": body.enabled,
        "timezone": body.timezone,
        "entries": json.dumps([e.model_dump() for e in body.entries])
    })
    await db.commit()
    row = result.first()
    return dict(row._mapping)

@router.get("/schedules/{schedule_id}")
async def get_schedule(schedule_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific schedule."""
    result = await db.execute(text(
        "SELECT * FROM show_schedules WHERE id = :id"
    ), {"id": schedule_id})
    row = result.first()
    if not row:
        raise HTTPException(404, "Schedule not found")
    return dict(row._mapping)

@router.patch("/schedules/{schedule_id}")
async def update_schedule(schedule_id: UUID, body: ScheduleUpdate, request: Request,
                          db: AsyncSession = Depends(get_db)):
    """Update an existing schedule."""
    _check_auth(request)
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    if body.timezone is not None:
        updates["timezone"] = body.timezone
    if body.entries is not None:
        for entry in body.entries:
            if entry.transition not in SHOW_PHASES:
                raise HTTPException(400, f"Invalid transition target: {entry.transition}")
        updates["entries"] = json.dumps([e.model_dump() for e in body.entries])

    if not updates:
        raise HTTPException(400, "No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = schedule_id
    result = await db.execute(text(
        f"UPDATE show_schedules SET {set_clauses}, updated_at = NOW() WHERE id = :id RETURNING *"
    ), updates)
    await db.commit()
    row = result.first()
    if not row:
        raise HTTPException(404, "Schedule not found")
    return dict(row._mapping)

@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: UUID, request: Request,
                          db: AsyncSession = Depends(get_db)):
    """Delete a schedule."""
    _check_auth(request)
    result = await db.execute(text(
        "DELETE FROM show_schedules WHERE id = :id RETURNING id"
    ), {"id": schedule_id})
    await db.commit()
    if not result.first():
        raise HTTPException(404, "Schedule not found")
    return {"status": "deleted"}

# =============================================================================
# SIDE EFFECTS CRUD
# =============================================================================

@router.get("/side-effects")
async def list_side_effects(db: AsyncSession = Depends(get_db)):
    """List all configured side effects."""
    result = await db.execute(text(
        "SELECT * FROM show_side_effects ORDER BY to_phase, sort_order"
    ))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]

@router.post("/side-effects")
async def create_side_effect(body: SideEffectCreate, request: Request,
                             db: AsyncSession = Depends(get_db)):
    """Create a new side effect."""
    _check_auth(request)
    if body.action_type not in ('entity_state_update', 'nats_publish', 'internal_call'):
        raise HTTPException(400, f"Invalid action_type: {body.action_type}")
    if body.action_type == 'internal_call':
        fn = body.action_config.get('function', '')
        if fn not in INTERNAL_FUNCTIONS:
            raise HTTPException(400, f"Unknown internal function: {fn}. Allowed: {list(INTERNAL_FUNCTIONS.keys())}")
    if body.action_type == 'nats_publish':
        subject = body.action_config.get('subject', '')
        if not subject.startswith('maestra.'):
            raise HTTPException(400, "NATS subject must start with 'maestra.'")
    result = await db.execute(text("""
        INSERT INTO show_side_effects (from_phase, to_phase, action_type, action_config, enabled, description, sort_order)
        VALUES (:from_phase, :to_phase, :action_type, CAST(:action_config AS jsonb), :enabled, :description, :sort_order)
        RETURNING *
    """), {
        "from_phase": body.from_phase,
        "to_phase": body.to_phase,
        "action_type": body.action_type,
        "action_config": json.dumps(body.action_config),
        "enabled": body.enabled,
        "description": body.description,
        "sort_order": body.sort_order
    })
    await db.commit()
    row = result.first()
    return dict(row._mapping)

@router.patch("/side-effects/{effect_id}")
async def update_side_effect(effect_id: UUID, body: SideEffectUpdate, request: Request,
                             db: AsyncSession = Depends(get_db)):
    """Update a side effect."""
    _check_auth(request)
    updates = {}
    if body.from_phase is not None:
        updates["from_phase"] = body.from_phase
    if body.to_phase is not None:
        updates["to_phase"] = body.to_phase
    if body.action_type is not None:
        updates["action_type"] = body.action_type
    if body.action_config is not None:
        updates["action_config"] = json.dumps(body.action_config)
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    if body.description is not None:
        updates["description"] = body.description
    if body.sort_order is not None:
        updates["sort_order"] = body.sort_order

    if not updates:
        raise HTTPException(400, "No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = effect_id
    result = await db.execute(text(
        f"UPDATE show_side_effects SET {set_clauses}, updated_at = NOW() WHERE id = :id RETURNING *"
    ), updates)
    await db.commit()
    row = result.first()
    if not row:
        raise HTTPException(404, "Side effect not found")
    return dict(row._mapping)

@router.delete("/side-effects/{effect_id}")
async def delete_side_effect(effect_id: UUID, request: Request,
                             db: AsyncSession = Depends(get_db)):
    """Delete a side effect."""
    _check_auth(request)
    result = await db.execute(text(
        "DELETE FROM show_side_effects WHERE id = :id RETURNING id"
    ), {"id": effect_id})
    await db.commit()
    if not result.first():
        raise HTTPException(404, "Side effect not found")
    return {"status": "deleted"}


# =============================================================================
# INBOUND SHOW COMMANDS (called from main.py NATS subscriptions)
# =============================================================================

async def handle_show_command(msg):
    """Handle inbound show commands from NATS (OSC/MQTT bridged).
    Subject pattern: maestra.show.command.<action> or maestra.osc.show.<action>
    """
    subject = msg.subject
    # Extract action from subject: maestra.show.command.go -> go
    parts = subject.split(".")
    if len(parts) < 4:
        return

    action = parts[-1]
    action_map = {
        "warmup": "pre_show",
        "go": "active",
        "pause": "paused",
        "resume": "active",
        "stop": "post_show",
        "shutdown": "shutdown",
        "reset": "idle",
    }

    target_phase = action_map.get(action)
    if not target_phase:
        logger.warning(f"Unknown show command: {action}")
        return

    # Determine source from subject prefix
    source = "osc" if "osc" in subject else "mqtt"

    try:
        async with async_session_maker() as db:
            await _do_transition("", target_phase, source, None, db)
        logger.info(f"Show command '{action}' executed from {source}")
    except HTTPException as e:
        logger.warning(f"Show command '{action}' rejected: {e.detail}")
    except Exception as e:
        logger.error(f"Show command '{action}' failed: {e}")
