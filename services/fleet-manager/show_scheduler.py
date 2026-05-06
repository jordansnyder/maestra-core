"""
Maestra Show Scheduler
Background asyncio task that evaluates show schedules every 60 seconds.
Same pattern as DMXPlaybackEngine._tick_loop().

On restart, evaluates all schedules against current time and fires
any missed transitions (catch-up for Fleet Manager restarts).
"""

import asyncio
import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional

from sqlalchemy import text
from database import async_session_maker

logger = logging.getLogger("show_scheduler")


class ShowScheduler:
    """Evaluates show schedules on a 60-second interval."""

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start the scheduler background task."""
        if self._running:
            return
        self._running = True
        # Run catch-up on startup
        await self._catch_up()
        self._task = asyncio.create_task(self._tick_loop())
        logger.info("Show scheduler started")

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Show scheduler stopped")

    async def _tick_loop(self):
        """Main scheduler loop. Runs every 60 seconds."""
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._evaluate_schedules()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler tick error: {e}")

    async def _evaluate_schedules(self):
        """Check all enabled schedules and fire matching transitions."""
        try:
            async with async_session_maker() as session:
                result = await session.execute(text("""
                    SELECT id, name, timezone, entries FROM show_schedules
                    WHERE enabled = true
                """))
                schedules = result.fetchall()

            for schedule in schedules:
                try:
                    tz = ZoneInfo(schedule.timezone)
                except Exception:
                    logger.warning(f"Invalid timezone '{schedule.timezone}' in schedule '{schedule.name}'")
                    continue

                now = datetime.now(tz)
                entries = schedule.entries or []

                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    cron_expr = entry.get("cron", "")
                    transition = entry.get("transition", "")
                    if not cron_expr or not transition:
                        continue

                    if self._cron_matches(cron_expr, now):
                        await self._fire_transition(transition, schedule.name)

        except Exception as e:
            logger.error(f"Schedule evaluation error: {e}")

    async def _catch_up(self):
        """On startup, check if any scheduled transition should have already fired.
        Evaluates the most recent applicable entry for each schedule."""
        try:
            async with async_session_maker() as session:
                # Get current show state
                result = await session.execute(text("""
                    SELECT state FROM entities WHERE slug = 'show'
                """))
                row = result.first()
                if not row:
                    return

                current_phase = (row.state or {}).get("phase", "idle")

                # Get all enabled schedules
                result = await session.execute(text("""
                    SELECT id, name, timezone, entries FROM show_schedules
                    WHERE enabled = true
                """))
                schedules = result.fetchall()

            for schedule in schedules:
                try:
                    tz = ZoneInfo(schedule.timezone)
                except Exception:
                    continue

                now = datetime.now(tz)
                entries = schedule.entries or []

                # Find the most recent entry that should have fired today
                # by checking all entries and finding which one's cron most
                # recently matched (within the current day)
                latest_transition = None
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    cron_expr = entry.get("cron", "")
                    transition = entry.get("transition", "")
                    if not cron_expr or not transition:
                        continue

                    # Simple catch-up: check if this entry should have fired
                    # earlier today (check each minute from midnight to now)
                    entry_hour, entry_minute = self._cron_time(cron_expr)
                    if entry_hour is not None and entry_minute is not None:
                        entry_time = now.replace(hour=entry_hour, minute=entry_minute, second=0)
                        if entry_time <= now:
                            if self._cron_day_matches(cron_expr, now):
                                if latest_transition is None or entry_time > latest_transition[0]:
                                    latest_transition = (entry_time, transition)

                if latest_transition and latest_transition[1] != current_phase:
                    logger.info(f"Catch-up: firing '{latest_transition[1]}' from schedule '{schedule.name}'")
                    await self._fire_transition(latest_transition[1], f"schedule-catchup:{schedule.name}")

        except Exception as e:
            logger.error(f"Schedule catch-up error: {e}")

    async def _fire_transition(self, target_phase: str, schedule_name: str):
        """Fire a show transition from the scheduler."""
        from show_control_router import _do_transition
        from fastapi import HTTPException
        try:
            async with async_session_maker() as db:
                await _do_transition("", target_phase, f"schedule:{schedule_name}", None, db)
            logger.info(f"Schedule '{schedule_name}' fired transition to '{target_phase}'")
        except HTTPException as e:
            # Expected: already in target state or invalid transition
            logger.debug(f"Schedule transition skipped: {e.detail}")
        except Exception as e:
            logger.error(f"Schedule transition to '{target_phase}' failed: {e}")

    def _cron_matches(self, cron_expr: str, now: datetime) -> bool:
        """Check if a cron expression matches the current minute.
        Format: minute hour day-of-month month day-of-week
        """
        try:
            parts = cron_expr.strip().split()
            if len(parts) != 5:
                return False

            return (
                self._field_matches(parts[0], now.minute, 0, 59) and
                self._field_matches(parts[1], now.hour, 0, 23) and
                self._field_matches(parts[2], now.day, 1, 31) and
                self._field_matches(parts[3], now.month, 1, 12) and
                self._field_matches(parts[4], now.weekday(), 0, 6, is_dow=True)
            )
        except Exception:
            return False

    def _cron_time(self, cron_expr: str):
        """Extract hour and minute from a cron expression if they're simple values."""
        try:
            parts = cron_expr.strip().split()
            if len(parts) != 5:
                return None, None
            minute = int(parts[0]) if parts[0].isdigit() else None
            hour = int(parts[1]) if parts[1].isdigit() else None
            return hour, minute
        except Exception:
            return None, None

    def _cron_day_matches(self, cron_expr: str, now: datetime) -> bool:
        """Check if the day-of-month, month, and day-of-week fields match."""
        try:
            parts = cron_expr.strip().split()
            if len(parts) != 5:
                return False
            return (
                self._field_matches(parts[2], now.day, 1, 31) and
                self._field_matches(parts[3], now.month, 1, 12) and
                self._field_matches(parts[4], now.weekday(), 0, 6, is_dow=True)
            )
        except Exception:
            return False

    def _field_matches(self, field: str, value: int, min_val: int, max_val: int,
                       is_dow: bool = False) -> bool:
        """Check if a cron field matches a value.
        Supports: * (any), N (exact), N-M (range), N,M (list), */N (step)
        Day of week: 0=Monday in Python, cron uses 0=Sunday or 1-7.
        """
        if field == '*':
            return True

        # Convert cron DOW (0=Sun, 1=Mon..6=Sat) to Python (0=Mon..6=Sun)
        if is_dow:
            # Python weekday: 0=Mon..6=Sun
            # Cron: 0=Sun, 1=Mon..6=Sat (or 7=Sun)
            # Convert Python to cron-style for comparison
            cron_dow = (value + 1) % 7  # Mon(0)->1, Sun(6)->0

        # Handle step: */N
        if field.startswith('*/'):
            try:
                step = int(field[2:])
                return value % step == 0
            except ValueError:
                return False

        # Handle list: N,M,O
        if ',' in field:
            vals = [int(v.strip()) for v in field.split(',')]
            check_val = cron_dow if is_dow else value
            return check_val in vals

        # Handle range: N-M
        if '-' in field:
            try:
                parts = field.split('-')
                low, high = int(parts[0]), int(parts[1])
                check_val = cron_dow if is_dow else value
                return low <= check_val <= high
            except (ValueError, IndexError):
                return False

        # Exact value
        try:
            check_val = cron_dow if is_dow else value
            return check_val == int(field)
        except ValueError:
            return False


# Singleton instance
show_scheduler = ShowScheduler()
