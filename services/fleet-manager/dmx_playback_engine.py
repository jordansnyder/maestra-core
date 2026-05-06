"""
DMX Playback Engine

Backend asyncio engine that mirrors the sequence playback logic previously
implemented in useSequencePlayback.ts / useCueFade.ts.

Runs an asyncio task at 80 ms intervals, interpolating fixture states between
cues and broadcasting entity state changes via state_manager (NATS + MQTT).

Source 'dmx-engine' is stamped on every broadcast so the NATS subscriber in
main.py can ignore its own events and avoid feedback loops.
"""

import asyncio
import json
import logging
import re
from typing import Optional

from sqlalchemy import text

from database import async_session_maker
from state_manager import state_manager

logger = logging.getLogger(__name__)

DMX_SEND_INTERVAL_DEFAULT = 0.02   # 20 ms — 50 Hz update rate (used before DB loads)
DIMMER_PATTERN = re.compile(r'dimmer|intensity|master|brightness', re.IGNORECASE)


def _normalize_state(state: dict, channel_map: dict) -> dict:
    """
    Normalize cue snapshot values to native entity-state format.

    Cue snapshots captured before the native-format migration may contain raw
    0–255 DMX integers.  This detects and converts them:
      range / color  →  0.0–1.0   (legacy 0–255 int: divide by 255)
      number         →  0–100     (legacy 0–255 int: scale to 0–100)
    """
    result = {}
    for key, value in state.items():
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            result[key] = value
            continue
        ch = channel_map.get(key, {})
        ch_type = ch.get('type', 'range') if isinstance(ch, dict) else 'range'
        if ch_type in ('range', 'color'):
            # Native: 0.0–1.0. Values > 1 are legacy 0–255.
            result[key] = round(value / 255, 4) if value > 1.0 else float(value)
        elif ch_type == 'number':
            # Native: 0–100. Values > 100 are legacy 0–255.
            result[key] = round((value / 255) * 100, 2) if value > 100 else float(value)
        else:
            result[key] = value
    return result


def _ease_in_out(t: float) -> float:
    return 2 * t * t if t < 0.5 else -1 + (4 - 2 * t) * t


def _interpolate_state(
    from_state: dict,
    to_state: dict,
    t: float,
) -> dict:
    """
    Interpolate between two state dicts at position t (0.0–1.0).

    Preserves decimal precision for native-format values (range/color = 0.0–1.0,
    number = 0–100). Booleans and non-numeric values snap at t = 0.5.
    """
    keys = set(from_state) | set(to_state)
    result = {}
    for k in keys:
        from_v = from_state.get(k, 0) or 0
        to_v = to_state.get(k, 0) or 0
        # Booleans: snap at midpoint
        if isinstance(from_v, bool) or isinstance(to_v, bool):
            result[k] = bool(to_v) if t >= 0.5 else bool(from_v)
        # Non-numeric: snap at midpoint
        elif not isinstance(from_v, (int, float)) or not isinstance(to_v, (int, float)):
            result[k] = to_v if t >= 0.5 else from_v
        else:
            # Smooth float interpolation — do NOT round; gateway handles floats correctly
            result[k] = from_v + (to_v - from_v) * t
    return result


class DMXGroupEngine:
    """
    Per-group playback engine.  One instance per DMX group (None key = ungrouped).
    Call play(), pause(), resume(), stop(), toggle_loop(), fade_out(), and
    recall_cue_fade() from FastAPI routes.  Status is exposed via the .status property.

    Uses jsonb_set merge semantics for entity state updates so multiple group
    engines can drive different channels on the same entity simultaneously (LTP).
    """

    def __init__(self, group_id: Optional[str] = None):
        self.group_id: Optional[str] = group_id  # None = ungrouped (legacy) engine

        # Configurable tick interval (seconds); loaded from DB at startup
        self._send_interval: float = DMX_SEND_INTERVAL_DEFAULT

        # Playback state
        self._play_state: str = 'stopped'   # stopped | playing | paused
        self._sequence_id: Optional[str] = None
        self._loaded: list = []             # [{placement: {...}, fixtures: [...]}]
        self._cue_index: int = 0
        self._phase: str = 'idle'           # transitioning | holding | idle
        self._phase_start: float = 0.0
        self._paused_elapsed: float = 0.0
        self._last_dmx_send: float = 0.0
        self._loop: bool = False
        self._fadeout_ms_on_complete: Optional[float] = None
        self._progress: float = 0.0
        self._hold_progress: float = 0.0
        self._fade_progress: Optional[float] = None

        # Live states captured at play() time — used as "from" for the first cue transition
        self._live_from_fixtures: list = []

        # asyncio tasks
        self._task: Optional[asyncio.Task] = None
        self._fade_task: Optional[asyncio.Task] = None

        # Cache: entity_id (str) → {slug, entity_type, path}
        self._entity_info: dict = {}

        # Status publishing throttle (publish at most every 100ms)
        self._last_status_publish: float = 0.0
        self._status_publish_interval: float = 0.1  # 100ms = 10 Hz

    # ── Status ────────────────────────────────────────────────────────────────

    @property
    def status(self) -> dict:
        return {
            "group_id": self.group_id,
            "sequence_id": self._sequence_id,
            "play_state": self._play_state,
            "phase": self._phase,
            "cue_index": self._cue_index,
            "progress": self._progress,
            "hold_progress": self._hold_progress,
            "loop": self._loop,
            "fade_progress": self._fade_progress,
            "interval_ms": round(self._send_interval * 1000),
            "fadeout_ms_on_complete": self._fadeout_ms_on_complete,
        }

    async def publish_status(self, force: bool = False) -> None:
        """Publish playback status to NATS for dashboard push updates.

        Throttled to at most 10 Hz unless force=True (used on state transitions).
        """
        now = asyncio.get_event_loop().time()
        if not force and (now - self._last_status_publish) < self._status_publish_interval:
            return
        self._last_status_publish = now

        try:
            nc = state_manager.nc
            if nc and not nc.is_closed:
                from datetime import datetime
                payload = json.dumps({
                    "type": "playback_status",
                    "engines": [self.status],
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }).encode()
                await nc.publish("maestra.dmx.playback.status", payload)
        except Exception as e:
            logger.debug(f"Status publish failed: {e}")

    async def load_settings(self) -> None:
        """Load persisted settings from DB (called once at startup)."""
        try:
            async with async_session_maker() as db:
                row = await db.execute(text(
                    "SELECT value FROM dmx_settings WHERE key = 'playback_interval_ms'"
                ))
                val = row.scalar()
                if val is not None:
                    ms = float(val)
                    if 10 <= ms <= 1000:
                        self._send_interval = ms / 1000.0
                        logger.info("Loaded playback interval: %.0f ms", ms)
        except Exception as e:
            logger.warning("Could not load DMX settings: %s", e)

    async def set_interval(self, interval_ms: float) -> None:
        """Update tick interval at runtime and persist to DB."""
        ms = max(10.0, min(1000.0, interval_ms))
        self._send_interval = ms / 1000.0
        try:
            async with async_session_maker() as db:
                await db.execute(text("""
                    INSERT INTO dmx_settings (key, value, updated_at)
                    VALUES ('playback_interval_ms', CAST(:v AS jsonb), NOW())
                    ON CONFLICT (key) DO UPDATE
                    SET value = CAST(:v AS jsonb), updated_at = NOW()
                """), {"v": str(ms)})
                await db.commit()
        except Exception as e:
            logger.error("Failed to persist playback interval: %s", e)

    # ── Public API ────────────────────────────────────────────────────────────

    async def play(self, sequence_id: str, loop: bool = False, fadeout_ms: Optional[float] = None) -> bool:
        await self._cancel_tasks()
        loaded = await self._load_sequence(sequence_id)
        if not loaded:
            return False

        first = loaded[0]
        first_transition = first['placement']['transition_time']

        self._sequence_id = sequence_id
        self._loaded = loaded
        self._cue_index = 0
        self._phase = 'transitioning' if first_transition > 0 else 'holding'
        self._play_state = 'playing'
        self._loop = loop
        self._fadeout_ms_on_complete = fadeout_ms
        self._phase_start = asyncio.get_event_loop().time()
        self._paused_elapsed = 0.0
        self._last_dmx_send = 0.0
        self._progress = 0.0 if first_transition > 0 else 1.0
        self._hold_progress = 0.0

        # Capture current live entity states so the first cue fades FROM the
        # current output rather than snapping to black.
        if first_transition > 0:
            first_entity_ids = [f['entity_id'] for f in first['fixtures']]
            live_map = await self._fetch_live_states(first_entity_ids)
            self._live_from_fixtures = [
                {
                    'entity_id': f['entity_id'],
                    'fixture_id': f['fixture_id'],
                    'state': _normalize_state(
                        live_map.get(f['entity_id'], {k: 0 for k in f['state']}),
                        f.get('channel_map', {}),
                    ),
                }
                for f in first['fixtures']
            ]
        else:
            self._live_from_fixtures = []
            await self._send_hard(first['fixtures'])

        await self._set_dmx_lighting_active(
            active_sequence_id=sequence_id,
            active_cue_id=None,
        )
        self._task = asyncio.create_task(self._tick_loop())
        await self.publish_status(force=True)
        return True

    async def pause(self):
        if self._play_state != 'playing':
            return
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._paused_elapsed += asyncio.get_event_loop().time() - self._phase_start
        self._play_state = 'paused'
        await self.publish_status(force=True)

    async def resume(self):
        if self._play_state != 'paused':
            return
        self._play_state = 'playing'
        self._phase_start = asyncio.get_event_loop().time()
        self._task = asyncio.create_task(self._tick_loop())
        await self.publish_status(force=True)

    async def stop(self):
        await self._cancel_tasks()
        had_sequence = self._sequence_id is not None
        self._play_state = 'stopped'
        self._cue_index = 0
        self._phase = 'idle'
        self._paused_elapsed = 0.0
        self._progress = 0.0
        self._hold_progress = 0.0
        self._sequence_id = None
        self._loaded = []
        if had_sequence:
            await self._set_dmx_lighting_active(
                active_sequence_id=None,
                active_cue_id=None,
            )
        await self.publish_status(force=True)

    async def toggle_loop(self) -> bool:
        self._loop = not self._loop
        return self._loop

    async def fade_out(self, duration_ms: float = 3000.0):
        """Fade dimmer channels of the current cue's fixtures to zero, then stop."""
        # Snapshot fixtures before cancelling tasks
        fixtures = list(self._loaded[self._cue_index]['fixtures']) \
            if self._loaded and self._cue_index < len(self._loaded) else []

        await self._cancel_tasks()
        self._play_state = 'stopped'
        self._sequence_id = None
        self._phase = 'idle'
        self._progress = 0.0
        self._hold_progress = 0.0
        self._loaded = []

        await self._set_dmx_lighting_active(active_sequence_id=None, active_cue_id=None)

        if fixtures:
            self._fade_task = asyncio.create_task(
                self._run_fade_out(fixtures, duration_ms)
            )

    async def recall_cue_fade(
        self,
        from_cue_id: Optional[str],
        to_cue_id: str,
        duration_ms: float,
    ) -> bool:
        """Fade from one cue snapshot to another over duration_ms milliseconds."""
        if self._fade_task and not self._fade_task.done():
            self._fade_task.cancel()
            try:
                await self._fade_task
            except asyncio.CancelledError:
                pass
            self._fade_task = None

        # Hard recall (duration == 0)
        if duration_ms <= 0:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT entity_id, state FROM dmx_cue_fixtures WHERE cue_id = CAST(:cue_id AS uuid)
                """), {"cue_id": to_cue_id})
                snapshots = rows.fetchall()
            if snapshots:
                updates = [(str(r.entity_id), {}, r.state or {}) for r in snapshots]
                await self._batch_update(updates)
            self._fade_progress = None
            # Update dmx-lighting entity to reflect recalled cue
            if self._play_state != 'playing':
                await self._set_dmx_lighting_active(
                    active_cue_id=to_cue_id, active_sequence_id=None
                )
            return True

        # Load from-fixtures (normalized)
        from_fixtures = []
        if from_cue_id:
            from_fixtures = await self._load_cue_fixtures(from_cue_id)

        # Load to-fixtures (normalized)
        to_fixtures = await self._load_cue_fixtures(to_cue_id)

        if not to_fixtures:
            self._fade_progress = None
            return False

        self._fade_progress = 0.0
        self._fade_task = asyncio.create_task(
            self._run_cue_fade(from_fixtures, to_fixtures, duration_ms, to_cue_id=to_cue_id)
        )
        return True

    # ── Tick loop ─────────────────────────────────────────────────────────────

    async def _tick_loop(self):
        try:
            while self._play_state == 'playing':
                await self._tick()
                await self.publish_status()  # throttled to 10 Hz
                await asyncio.sleep(self._send_interval)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("DMX playback tick error: %s", e, exc_info=True)

    async def _tick(self):
        now = asyncio.get_event_loop().time()
        elapsed = (now - self._phase_start) + self._paused_elapsed

        if not self._loaded or self._cue_index >= len(self._loaded):
            await self.stop()
            return

        current = self._loaded[self._cue_index]

        if self._phase == 'transitioning':
            duration_s = current['placement']['transition_time']
            t = min(elapsed / duration_s, 1.0) if duration_s > 0 else 1.0
            eased = _ease_in_out(t)
            self._progress = t

            if now - self._last_dmx_send >= self._send_interval:
                self._last_dmx_send = now
                prev = self._loaded[self._cue_index - 1] if self._cue_index > 0 else None
                if duration_s == 0:
                    await self._send_hard(current['fixtures'])
                elif self._cue_index == 0:
                    if self._live_from_fixtures:
                        await self._apply_interpolated(self._live_from_fixtures, current['fixtures'], eased)
                    else:
                        await self._apply_from_black(current['fixtures'], eased)
                elif prev:
                    await self._apply_interpolated(prev['fixtures'], current['fixtures'], eased)

            if t >= 1.0:
                await self._send_hard(current['fixtures'])
                self._phase = 'holding'
                self._phase_start = now
                self._paused_elapsed = 0.0
                await self._set_dmx_lighting_active(
                    active_cue_id=current['placement']['cue_id']
                )

        else:  # holding
            hold_s = current['placement']['hold_duration']
            hold_progress = min(elapsed / hold_s, 1.0) if hold_s > 0 else 1.0
            self._hold_progress = hold_progress

            if hold_progress >= 1.0:
                next_idx = self._cue_index + 1
                if next_idx >= len(self._loaded):
                    if self._loop:
                        self._cue_index = 0
                        self._phase = 'transitioning'
                        self._phase_start = now
                        self._paused_elapsed = 0.0
                        self._last_dmx_send = 0.0
                    else:
                        # Sequence complete — stop tick loop; lights stay at last cue unless
                        # fadeout was configured, in which case kick off the fade background task.
                        if self._fadeout_ms_on_complete is not None:
                            fixtures = list(self._loaded[self._cue_index]['fixtures']) if self._loaded else []
                        self._play_state = 'stopped'
                        self._sequence_id = None
                        self._loaded = []
                        self._cue_index = 0
                        self._phase = 'idle'
                        self._paused_elapsed = 0.0
                        await self._set_dmx_lighting_active(
                            active_sequence_id=None, active_cue_id=None
                        )
                        if self._fadeout_ms_on_complete is not None and fixtures:
                            self._fade_task = asyncio.create_task(
                                self._run_fade_out(fixtures, self._fadeout_ms_on_complete)
                            )
                else:
                    self._cue_index = next_idx
                    self._phase = 'transitioning'
                    self._phase_start = now
                    self._paused_elapsed = 0.0
                    self._last_dmx_send = 0.0

    # ── Fade-out background task ───────────────────────────────────────────────

    async def _run_fade_out(self, fixtures: list, duration_ms: float):
        try:
            self._fade_progress = 0.0
            start = asyncio.get_event_loop().time()
            duration_s = duration_ms / 1000.0

            while True:
                now = asyncio.get_event_loop().time()
                t = min((now - start) / duration_s, 1.0)
                dim_factor = 1.0 - _ease_in_out(t)
                self._fade_progress = t

                updates = []
                for f in fixtures:
                    faded = {
                        k: v * dim_factor if DIMMER_PATTERN.search(k) else v
                        for k, v in (f['state'] or {}).items()
                        if isinstance(v, (int, float)) and not isinstance(v, bool)
                    }
                    # Preserve non-numeric values unchanged
                    for k, v in (f['state'] or {}).items():
                        if k not in faded:
                            faded[k] = v
                    updates.append((f['entity_id'], f['state'], faded))
                await self._batch_update(updates)

                if t >= 1.0:
                    break
                await asyncio.sleep(self._send_interval)
        except asyncio.CancelledError:
            pass
        finally:
            self._fade_progress = None
            self._fade_task = None

    # ── Cue-to-cue fade background task ───────────────────────────────────────

    async def _run_cue_fade(
        self,
        from_fixtures: list,
        to_fixtures: list,
        duration_ms: float,
        to_cue_id: Optional[str] = None,
    ):
        try:
            to_map = {f['entity_id']: f for f in to_fixtures}
            from_map = {f['entity_id']: f for f in from_fixtures}
            entity_ids = list(set(to_map) | set(from_map))

            # Pre-cache entity info
            uncached = [eid for eid in entity_ids if eid not in self._entity_info]
            if uncached:
                await self._cache_entity_info(uncached)

            start = asyncio.get_event_loop().time()
            duration_s = duration_ms / 1000.0
            self._fade_progress = 0.0

            while True:
                now = asyncio.get_event_loop().time()
                t = min((now - start) / duration_s, 1.0)
                eased = _ease_in_out(t)
                self._fade_progress = t

                updates = []
                for eid in entity_ids:
                    from_state = from_map.get(eid, {}).get('state', {}) or {}
                    to_state = to_map.get(eid, {}).get('state', {}) or {}
                    interp = _interpolate_state(from_state, to_state, eased)
                    updates.append((eid, from_state, interp))
                await self._batch_update(updates)

                if t >= 1.0:
                    break
                await asyncio.sleep(self._send_interval)

            # Snap to exact final state
            final = [(f['entity_id'], {}, f['state'] or {}) for f in to_fixtures]
            await self._batch_update(final)

            # Update dmx-lighting entity with the recalled cue (direct recall, not sequence)
            if to_cue_id and self._play_state != 'playing':
                await self._set_dmx_lighting_active(
                    active_cue_id=to_cue_id, active_sequence_id=None
                )
        except asyncio.CancelledError:
            pass
        finally:
            self._fade_progress = None
            self._fade_task = None

    # ── Entity state helpers ───────────────────────────────────────────────────

    async def _send_hard(self, fixtures: list):
        updates = [(f['entity_id'], {}, f['state'] or {}) for f in fixtures]
        await self._batch_update(updates)

    async def _apply_from_black(self, fixtures: list, t: float):
        updates = []
        for f in fixtures:
            zeros = {k: 0 for k in (f['state'] or {})}
            interp = _interpolate_state(zeros, f['state'] or {}, t)
            updates.append((f['entity_id'], {}, interp))
        await self._batch_update(updates)

    async def _apply_interpolated(self, from_fixtures: list, to_fixtures: list, t: float):
        to_map = {f['entity_id']: f for f in to_fixtures}
        from_map = {f['entity_id']: f for f in from_fixtures}
        entity_ids = set(to_map) | set(from_map)
        updates = []
        for eid in entity_ids:
            from_state = from_map.get(eid, {}).get('state', {}) or {}
            to_state = to_map.get(eid, {}).get('state', {}) or {}
            interp = _interpolate_state(from_state, to_state, t)
            updates.append((eid, from_state, interp))
        await self._batch_update(updates)

    async def _batch_update(self, updates: list):
        """Batch-update entity states via jsonb merge, then broadcast each change to NATS.

        Uses `state || patch` (jsonb concatenation) instead of a full state replace so
        multiple group engines can write different channels on the same entity
        simultaneously without clobbering each other (LTP semantics).
        """
        if not updates:
            return
        try:
            uncached = [uid for uid, _, _ in updates if uid not in self._entity_info]
            if uncached:
                await self._cache_entity_info(uncached)

            async with async_session_maker() as db:
                for entity_id, _, new_state in updates:
                    await db.execute(text("""
                        UPDATE entities
                        SET state = COALESCE(state, '{}'::jsonb) || CAST(:patch AS jsonb),
                            state_updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                    """), {"patch": json.dumps(new_state), "id": entity_id})
                await db.commit()

            for entity_id, prev_state, new_state in updates:
                info = self._entity_info.get(entity_id)
                if not info:
                    continue
                try:
                    await state_manager.broadcast_state_change(
                        entity_id=entity_id,
                        entity_slug=info['slug'],
                        entity_type=info['entity_type'],
                        entity_path=info.get('path'),
                        previous_state=prev_state or {},
                        new_state=new_state,
                        source='dmx-engine',
                    )
                except Exception:
                    pass
        except Exception as e:
            logger.error("DMX batch entity update error: %s", e)

    async def _fetch_live_states(self, entity_ids: list) -> dict:
        """Fetch current entity states from DB. Returns {entity_id: state_dict}."""
        try:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT id, state FROM entities
                    WHERE id = ANY(CAST(:ids AS uuid[]))
                """), {"ids": entity_ids})
                return {str(r.id): r.state or {} for r in rows.fetchall()}
        except Exception as e:
            logger.error("Failed to fetch live entity states: %s", e)
            return {}

    async def _load_cue_fixtures(self, cue_id: str) -> list:
        """
        Load fixture snapshots for a cue, joined with the fixture's channel_map
        so values can be normalized from legacy 0–255 to native format.
        """
        try:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT cf.fixture_id, cf.entity_id, cf.state, f.channel_map
                    FROM dmx_cue_fixtures cf
                    JOIN dmx_fixtures f ON f.id = CAST(cf.fixture_id AS uuid)
                    WHERE cf.cue_id = CAST(:cue_id AS uuid)
                """), {"cue_id": cue_id})
                return [
                    {
                        "fixture_id": str(r.fixture_id),
                        "entity_id": str(r.entity_id),
                        "channel_map": r.channel_map or {},
                        "state": _normalize_state(r.state or {}, r.channel_map or {}),
                    }
                    for r in rows.fetchall()
                ]
        except Exception as e:
            logger.error("Failed to load cue fixtures for cue %s: %s", cue_id, e)
            return []

    async def _cache_entity_info(self, entity_ids: list):
        try:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT e.id, e.slug, e.path, et.name AS entity_type
                    FROM entities e
                    JOIN entity_types et ON et.id = e.entity_type_id
                    WHERE e.id = ANY(CAST(:ids AS uuid[]))
                """), {"ids": entity_ids})
                for r in rows.fetchall():
                    self._entity_info[str(r.id)] = {
                        "slug": r.slug,
                        "entity_type": r.entity_type,
                        "path": r.path,
                    }
        except Exception as e:
            logger.error("DMX entity info cache error: %s", e)

    async def _set_dmx_lighting_active(
        self,
        active_sequence_id: Optional[str] = None,
        active_cue_id: Optional[str] = None,
    ):
        """Update active_sequence_id / active_cue_id on the dmx-lighting entity."""
        try:
            async with async_session_maker() as db:
                row = await db.execute(text("""
                    SELECT e.id, e.slug, e.state, e.path, et.name AS entity_type
                    FROM entities e
                    JOIN entity_types et ON et.id = e.entity_type_id
                    WHERE e.slug = 'dmx-lighting'
                """))
                entity = row.fetchone()
                if not entity:
                    return
                prev_state = entity.state or {}
                new_state = {
                    **prev_state,
                    "active_sequence_id": active_sequence_id,
                    "active_cue_id": active_cue_id,
                }
                await db.execute(text("""
                    UPDATE entities
                    SET state = CAST(:state AS jsonb), state_updated_at = NOW()
                    WHERE id = :id
                """), {"state": json.dumps(new_state), "id": str(entity.id)})
                await db.commit()

            await state_manager.broadcast_state_change(
                entity_id=str(entity.id),
                entity_slug=entity.slug,
                entity_type=entity.entity_type,
                entity_path=entity.path,
                previous_state=prev_state,
                new_state=new_state,
                source='dmx-engine',
            )
        except Exception as e:
            logger.error("DMX lighting active update error: %s", e)

    # ── Sequence / cue loader ─────────────────────────────────────────────────

    async def _load_sequence(self, sequence_id: str) -> list:
        try:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT sc.id, sc.cue_id, c.name AS cue_name,
                           sc.position, sc.transition_time, sc.hold_duration
                    FROM dmx_sequence_cues sc
                    JOIN dmx_cues c ON c.id = sc.cue_id
                    WHERE sc.sequence_id = :sid
                    ORDER BY sc.position ASC
                """), {"sid": sequence_id})
                placements = rows.fetchall()

                if not placements:
                    return []

                loaded = []
                for p in placements:
                    fixture_rows = await db.execute(text("""
                        SELECT cf.fixture_id, cf.entity_id, cf.state, f.channel_map
                        FROM dmx_cue_fixtures cf
                        JOIN dmx_fixtures f ON f.id = CAST(cf.fixture_id AS uuid)
                        WHERE cf.cue_id = CAST(:cue_id AS uuid)
                    """), {"cue_id": str(p.cue_id)})
                    fixtures = [
                        {
                            "fixture_id": str(r.fixture_id),
                            "entity_id": str(r.entity_id),
                            "channel_map": r.channel_map or {},
                            "state": _normalize_state(r.state or {}, r.channel_map or {}),
                        }
                        for r in fixture_rows.fetchall()
                    ]
                    loaded.append({
                        "placement": {
                            "id": str(p.id),
                            "cue_id": str(p.cue_id),
                            "cue_name": p.cue_name,
                            "transition_time": float(p.transition_time or 0),
                            "hold_duration": float(p.hold_duration or 0),
                        },
                        "fixtures": fixtures,
                    })

                # Pre-cache entity info
                all_entity_ids = list({
                    f['entity_id']
                    for item in loaded
                    for f in item['fixtures']
                    if f['entity_id'] not in self._entity_info
                })
                if all_entity_ids:
                    await self._cache_entity_info(all_entity_ids)

                return loaded
        except Exception as e:
            logger.error("DMX sequence load error: %s", e)
            return []

    # ── Cleanup ───────────────────────────────────────────────────────────────

    async def _cancel_tasks(self):
        for task in [self._task, self._fade_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._task = None
        self._fade_task = None

    async def shutdown(self):
        await self._cancel_tasks()


# =============================================================================
# Engine Registry — one DMXGroupEngine per group (None key = ungrouped/legacy)
# =============================================================================

class DMXEngineRegistry:
    """
    Singleton registry of per-group playback engines.

    Key None  →  ungrouped (legacy) engine — backward-compatible with all
                 existing API calls that omit group_id.
    Key <str> →  one engine per DMX group UUID.

    Engines are created on demand and never destroyed (they just sit idle).
    This preserves playback state across API calls without re-instantiation.
    """

    def __init__(self):
        self._engines: dict[Optional[str], DMXGroupEngine] = {
            None: DMXGroupEngine(group_id=None)
        }
        self._lock = asyncio.Lock()

    def get(self, group_id: Optional[str] = None) -> DMXGroupEngine:
        """Return the engine for the given group_id, creating it on first access."""
        if group_id not in self._engines:
            self._engines[group_id] = DMXGroupEngine(group_id=group_id)
        return self._engines[group_id]

    @property
    def ungrouped(self) -> DMXGroupEngine:
        """Convenience accessor for the legacy ungrouped engine."""
        return self._engines[None]

    def all_statuses(self) -> list:
        """Return status dicts for all engines that are not idle."""
        return [e.status for e in self._engines.values()]

    async def load_settings(self) -> None:
        """Load persisted settings into the ungrouped (legacy) engine at startup."""
        await self._engines[None].load_settings()

    async def shutdown_all(self) -> None:
        for engine in self._engines.values():
            await engine.shutdown()


# Registry singleton — used by dmx_router.py playback endpoints
engine_registry = DMXEngineRegistry()

# Backward-compatible alias — existing imports of `playback_engine` continue to work
playback_engine = engine_registry.ungrouped
