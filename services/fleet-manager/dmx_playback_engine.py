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

DMX_SEND_INTERVAL = 0.08          # 80 ms — matches frontend DMX_SEND_INTERVAL_MS
DIMMER_PATTERN = re.compile(r'dimmer|intensity|master|brightness', re.IGNORECASE)


def _ease_in_out(t: float) -> float:
    return 2 * t * t if t < 0.5 else -1 + (4 - 2 * t) * t


def _interpolate_state(
    from_state: dict,
    to_state: dict,
    t: float,
) -> dict:
    keys = set(from_state) | set(to_state)
    return {
        k: round((from_state.get(k, 0) or 0) + ((to_state.get(k, 0) or 0) - (from_state.get(k, 0) or 0)) * t)
        for k in keys
    }


class DMXPlaybackEngine:
    """
    Singleton playback engine.  Call play(), pause(), resume(), stop(),
    toggle_loop(), fade_out(), and recall_cue_fade() from FastAPI routes.
    Status is exposed via the .status property.
    """

    def __init__(self):
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
        self._progress: float = 0.0
        self._hold_progress: float = 0.0
        self._fade_progress: Optional[float] = None

        # asyncio tasks
        self._task: Optional[asyncio.Task] = None
        self._fade_task: Optional[asyncio.Task] = None

        # Cache: entity_id (str) → {slug, entity_type, path}
        self._entity_info: dict = {}

    # ── Status ────────────────────────────────────────────────────────────────

    @property
    def status(self) -> dict:
        return {
            "sequence_id": self._sequence_id,
            "play_state": self._play_state,
            "phase": self._phase,
            "cue_index": self._cue_index,
            "progress": self._progress,
            "hold_progress": self._hold_progress,
            "loop": self._loop,
            "fade_progress": self._fade_progress,
        }

    # ── Public API ────────────────────────────────────────────────────────────

    async def play(self, sequence_id: str) -> bool:
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
        self._phase_start = asyncio.get_event_loop().time()
        self._paused_elapsed = 0.0
        self._last_dmx_send = 0.0
        self._progress = 0.0 if first_transition > 0 else 1.0
        self._hold_progress = 0.0

        # Apply initial fixture states
        if first_transition == 0:
            await self._send_hard(first['fixtures'])
        else:
            zeros = [{**f, 'state': {k: 0 for k in f['state']}} for f in first['fixtures']]
            await self._send_hard(zeros)

        await self._set_dmx_lighting_active(
            active_sequence_id=sequence_id,
            active_cue_id=None,
        )
        self._task = asyncio.create_task(self._tick_loop())
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

    async def resume(self):
        if self._play_state != 'paused':
            return
        self._play_state = 'playing'
        self._phase_start = asyncio.get_event_loop().time()
        self._task = asyncio.create_task(self._tick_loop())

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
                    SELECT entity_id, state FROM dmx_cue_fixtures WHERE cue_id = :cue_id
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

        # Load from-fixtures
        from_fixtures = []
        if from_cue_id:
            async with async_session_maker() as db:
                rows = await db.execute(text("""
                    SELECT fixture_id, entity_id, state FROM dmx_cue_fixtures
                    WHERE cue_id = :cue_id
                """), {"cue_id": from_cue_id})
                from_fixtures = [
                    {"fixture_id": str(r.fixture_id), "entity_id": str(r.entity_id), "state": r.state or {}}
                    for r in rows.fetchall()
                ]

        # Load to-fixtures
        async with async_session_maker() as db:
            rows = await db.execute(text("""
                SELECT fixture_id, entity_id, state FROM dmx_cue_fixtures
                WHERE cue_id = :cue_id
            """), {"cue_id": to_cue_id})
            to_fixtures = [
                {"fixture_id": str(r.fixture_id), "entity_id": str(r.entity_id), "state": r.state or {}}
                for r in rows.fetchall()
            ]

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
                await asyncio.sleep(DMX_SEND_INTERVAL)
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

            if now - self._last_dmx_send >= DMX_SEND_INTERVAL:
                self._last_dmx_send = now
                prev = self._loaded[self._cue_index - 1] if self._cue_index > 0 else None
                if duration_s == 0:
                    await self._send_hard(current['fixtures'])
                elif self._cue_index == 0:
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
                        # Sequence complete — clear entity IDs and stop (lights stay at last cue)
                        self._play_state = 'stopped'
                        self._sequence_id = None
                        self._loaded = []
                        self._cue_index = 0
                        self._phase = 'idle'
                        self._paused_elapsed = 0.0
                        await self._set_dmx_lighting_active(
                            active_sequence_id=None, active_cue_id=None
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
                        k: round(v * dim_factor) if DIMMER_PATTERN.search(k) else v
                        for k, v in (f['state'] or {}).items()
                    }
                    updates.append((f['entity_id'], f['state'], faded))
                await self._batch_update(updates)

                if t >= 1.0:
                    break
                await asyncio.sleep(DMX_SEND_INTERVAL)
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
                await asyncio.sleep(DMX_SEND_INTERVAL)

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
        """Batch-update entity states in DB, then broadcast each change to NATS."""
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
                        SET state = CAST(:state AS jsonb), state_updated_at = NOW()
                        WHERE id = CAST(:id AS uuid)
                    """), {"state": json.dumps(new_state), "id": entity_id})
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
                        SELECT fixture_id, entity_id, state
                        FROM dmx_cue_fixtures WHERE cue_id = :cue_id
                    """), {"cue_id": str(p.cue_id)})
                    fixtures = [
                        {
                            "fixture_id": str(r.fixture_id),
                            "entity_id": str(r.entity_id),
                            "state": r.state or {},
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


# Singleton instance
playback_engine = DMXPlaybackEngine()
