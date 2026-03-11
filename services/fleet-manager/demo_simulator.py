"""
Demo Simulator — generates live telemetry for the 3 demo devices and 6 demo
entities so the Maestra dashboard looks alive out of the box.

Activated when DEMO_MODE=true (checked in main.py startup).

Three concurrent loops run at different cadences:
  1. Metrics loop  (every 10s)  — realistic device metrics with smooth drift
  2. Events loop   (every 30s)  — random operational events
  3. Entity loop   (every 60s)  — entity state updates broadcast via NATS

All data is written to PostgreSQL (via async SQLAlchemy) and published to
NATS so both the REST API and the real-time dashboard stay in sync.
"""

import asyncio
import json
import logging
import math
import random
import time as _time
from datetime import datetime
from typing import Dict, Any, Optional, List
from uuid import UUID

from nats.aio.client import Client as NATS
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_maker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fixed UUIDs matching 06-demo-data.sql
# ---------------------------------------------------------------------------

DEMO_DEVICES = [
    {
        "id": "d0000000-0000-0000-0000-000000000001",
        "name": "Gallery Projector",
        "type": "media_server",
    },
    {
        "id": "d0000000-0000-0000-0000-000000000002",
        "name": "Lobby Sensor Hub",
        "type": "sensor",
    },
    {
        "id": "d0000000-0000-0000-0000-000000000003",
        "name": "Stage Controller",
        "type": "controller",
    },
]

DEMO_ENTITIES = [
    {
        "id": "e0000000-0000-0000-0000-000000000005",
        "slug": "gallery-light-1",
        "name": "Gallery Light 1",
        "type": "light",
        "path": "demo_venue.gallery.gallery_light_1",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000006",
        "slug": "lobby-temp-sensor",
        "name": "Lobby Temp Sensor",
        "type": "sensor",
        "path": "demo_venue.lobby.lobby_temp_sensor",
    },
]

EVENT_TEMPLATES: List[Dict[str, Any]] = [
    {"event_type": "heartbeat",         "severity": "info",    "message": "Heartbeat received from {device}"},
    {"event_type": "heartbeat",         "severity": "info",    "message": "Heartbeat received from {device}"},
    {"event_type": "connection",        "severity": "info",    "message": "{device} connection stable"},
    {"event_type": "config_change",     "severity": "info",    "message": "Configuration updated on {device}"},
    {"event_type": "temperature_alert", "severity": "warning", "message": "Temperature elevated on {device}: {value}C"},
    {"event_type": "temperature_alert", "severity": "warning", "message": "Humidity above threshold on {device}: {value}%"},
    {"event_type": "connection",        "severity": "warning", "message": "{device} experienced brief network disruption"},
]


class DemoSimulator:
    """
    Background async task that continuously generates demo telemetry.

    Usage::

        simulator = DemoSimulator()
        await simulator.start(nats_client)
        ...
        await simulator.stop()
    """

    def __init__(self):
        self.running: bool = False
        self.nc: Optional[NATS] = None
        self._tasks: List[asyncio.Task] = []

        # Internal state for smooth random walks
        self._cpu_values: Dict[str, float] = {d["id"]: 40.0 for d in DEMO_DEVICES}
        self._mem_values: Dict[str, float] = {d["id"]: 55.0 for d in DEMO_DEVICES}
        self._light_brightness: float = 75.0
        self._sensor_temp: float = 22.5
        self._sensor_humidity: float = 45.0
        self._start_time: float = _time.time()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self, nc: Optional[NATS] = None) -> None:
        """Start all simulator loops."""
        if self.running:
            logger.warning("DemoSimulator already running")
            return

        self.nc = nc
        self.running = True
        self._start_time = _time.time()

        self._tasks = [
            asyncio.create_task(self._metrics_loop(), name="demo-metrics"),
            asyncio.create_task(self._events_loop(), name="demo-events"),
            asyncio.create_task(self._entity_loop(), name="demo-entities"),
        ]

        logger.info("DemoSimulator started (3 background loops)")

    async def stop(self) -> None:
        """Gracefully stop all loops."""
        self.running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("DemoSimulator stopped")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _elapsed(self) -> float:
        """Seconds since simulator start — drives sine-wave oscillations."""
        return _time.time() - self._start_time

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, value))

    def _random_walk(self, current: float, step: float, lo: float, hi: float) -> float:
        """Bounded random walk: drift by up to +/-step, clamped to [lo, hi]."""
        delta = (random.random() - 0.5) * 2 * step
        return self._clamp(current + delta, lo, hi)

    def _envelope(self, subject: str, data: Dict[str, Any]) -> bytes:
        """Build a standard Maestra message envelope."""
        envelope = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "source": "demo-simulator",
            "topic": subject,
            "data": data,
        }
        return json.dumps(envelope).encode()

    async def _publish(self, subject: str, data: Dict[str, Any]) -> None:
        """Publish to NATS if connected, silently skip otherwise."""
        if not self.nc or self.nc.is_closed:
            return
        try:
            await self.nc.publish(subject, self._envelope(subject, data))
        except Exception as exc:
            logger.debug("NATS publish to %s failed: %s", subject, exc)

    # ------------------------------------------------------------------
    # Loop 1: Device Metrics (every 10 seconds)
    # ------------------------------------------------------------------

    async def _metrics_loop(self) -> None:
        """Insert realistic metrics for the 3 demo devices every 10 seconds."""
        logger.info("Demo metrics loop started (interval=10s)")
        while self.running:
            try:
                await self._insert_metrics()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in demo metrics loop")
            await asyncio.sleep(10)

    async def _insert_metrics(self) -> None:
        elapsed = self._elapsed()

        async with async_session_maker() as session:
            for device in DEMO_DEVICES:
                did = device["id"]

                # Temperature: slow sine drift 20-25 C (period ~1 hour)
                temperature = 22.5 + 2.5 * math.sin(elapsed * 2 * math.pi / 3600)
                temperature += (random.random() - 0.5) * 0.3

                # CPU: bounded random walk 15-65%
                self._cpu_values[did] = self._random_walk(
                    self._cpu_values[did], step=3.0, lo=15.0, hi=65.0
                )

                # Memory: bounded random walk 40-70%
                self._mem_values[did] = self._random_walk(
                    self._mem_values[did], step=1.5, lo=40.0, hi=70.0
                )

                metrics = [
                    ("temperature",    round(temperature, 2),               "celsius"),
                    ("cpu_percent",    round(self._cpu_values[did], 1),     "percent"),
                    ("memory_percent", round(self._mem_values[did], 1),     "percent"),
                ]

                for metric_name, metric_value, unit in metrics:
                    await session.execute(text("""
                        INSERT INTO device_metrics (time, device_id, metric_name, metric_value, unit, tags)
                        VALUES (NOW(), :device_id, :metric_name, :metric_value, :unit, CAST(:tags AS jsonb))
                    """), {
                        "device_id": did,
                        "metric_name": metric_name,
                        "metric_value": metric_value,
                        "unit": unit,
                        "tags": json.dumps({"source": "demo-simulator", "device_name": device["name"]}),
                    })

                    # Publish to NATS
                    await self._publish("maestra.device.metrics", {
                        "device_id": did,
                        "device_name": device["name"],
                        "metric_name": metric_name,
                        "metric_value": metric_value,
                        "unit": unit,
                    })

            await session.commit()

    # ------------------------------------------------------------------
    # Loop 2: Device Events (every 30 seconds)
    # ------------------------------------------------------------------

    async def _events_loop(self) -> None:
        """Insert random device events every 30 seconds."""
        logger.info("Demo events loop started (interval=30s)")
        while self.running:
            try:
                await self._insert_event()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in demo events loop")
            await asyncio.sleep(30)

    async def _insert_event(self) -> None:
        device = random.choice(DEMO_DEVICES)
        template = random.choice(EVENT_TEMPLATES)

        # Fill in template placeholders
        alert_value = round(random.uniform(25, 30), 1) if "temperature" in template["event_type"] else round(random.uniform(65, 78), 1)
        message = template["message"].format(
            device=device["name"],
            value=alert_value,
        )

        event_data = {
            "source": "demo-simulator",
            "device_name": device["name"],
        }
        if template["severity"] == "warning":
            event_data["value"] = alert_value

        async with async_session_maker() as session:
            await session.execute(text("""
                INSERT INTO device_events (time, device_id, event_type, severity, message, data)
                VALUES (NOW(), :device_id, :event_type, :severity, :message, CAST(:data AS jsonb))
            """), {
                "device_id": device["id"],
                "event_type": template["event_type"],
                "severity": template["severity"],
                "message": message,
                "data": json.dumps(event_data),
            })
            await session.commit()

        # Publish to NATS
        await self._publish("maestra.device.events", {
            "device_id": device["id"],
            "device_name": device["name"],
            "event_type": template["event_type"],
            "severity": template["severity"],
            "message": message,
        })

    # ------------------------------------------------------------------
    # Loop 3: Entity State Updates (every 60 seconds)
    # ------------------------------------------------------------------

    async def _entity_loop(self) -> None:
        """Drift entity state and broadcast changes every 60 seconds."""
        logger.info("Demo entity loop started (interval=60s)")
        while self.running:
            try:
                await self._update_entity_states()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in demo entity loop")
            await asyncio.sleep(60)

    async def _update_entity_states(self) -> None:
        async with async_session_maker() as session:
            for entity in DEMO_ENTITIES:
                # Read current state from DB
                result = await session.execute(text(
                    "SELECT state FROM entities WHERE id = :id"
                ), {"id": entity["id"]})
                row = result.fetchone()
                if not row:
                    continue

                current_state: Dict[str, Any] = row[0] or {}
                new_state = dict(current_state)

                if entity["type"] == "light":
                    # Drift brightness smoothly
                    self._light_brightness = self._random_walk(
                        self._light_brightness, step=5.0, lo=20.0, hi=100.0
                    )
                    new_state["brightness"] = round(self._light_brightness)
                    # Occasionally toggle on/off
                    if random.random() < 0.05:
                        new_state["on"] = not new_state.get("on", True)

                elif entity["type"] == "sensor":
                    # Drift temperature
                    self._sensor_temp = self._random_walk(
                        self._sensor_temp, step=0.3, lo=18.0, hi=28.0
                    )
                    new_state["temperature"] = round(self._sensor_temp, 1)

                    # Drift humidity
                    self._sensor_humidity = self._random_walk(
                        self._sensor_humidity, step=1.0, lo=30.0, hi=70.0
                    )
                    new_state["humidity"] = round(self._sensor_humidity, 1)

                    # Random motion toggle
                    if random.random() < 0.15:
                        new_state["motion"] = not new_state.get("motion", False)

                # Compute changed keys
                changed_keys = [
                    k for k in set(list(current_state.keys()) + list(new_state.keys()))
                    if current_state.get(k) != new_state.get(k)
                ]

                if not changed_keys:
                    continue

                # Update entity state in DB
                await session.execute(text("""
                    UPDATE entities SET state = CAST(:state AS jsonb) WHERE id = :id
                """), {
                    "state": json.dumps(new_state),
                    "id": entity["id"],
                })

                # Record in entity_states hypertable
                await session.execute(text("""
                    INSERT INTO entity_states
                        (time, entity_id, entity_slug, entity_type, entity_path,
                         state, previous_state, changed_keys, source)
                    VALUES
                        (NOW(), :entity_id, :entity_slug, :entity_type, :entity_path,
                         CAST(:state AS jsonb), CAST(:previous_state AS jsonb),
                         :changed_keys, :source)
                """), {
                    "entity_id": entity["id"],
                    "entity_slug": entity["slug"],
                    "entity_type": entity["type"],
                    "entity_path": entity["path"],
                    "state": json.dumps(new_state),
                    "previous_state": json.dumps(current_state),
                    "changed_keys": changed_keys,
                    "source": "demo-simulator",
                })

                # Broadcast state change via NATS (matches state_manager format)
                state_event = {
                    "type": "state_changed",
                    "entity_id": entity["id"],
                    "entity_slug": entity["slug"],
                    "entity_type": entity["type"],
                    "path": entity["path"],
                    "previous_state": current_state,
                    "current_state": new_state,
                    "changed_keys": changed_keys,
                    "source": "demo-simulator",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "validation_warnings": [],
                }

                payload = json.dumps(state_event).encode()

                if self.nc and not self.nc.is_closed:
                    try:
                        # Publish to all three subjects the state_manager normally uses
                        subject_specific = f"maestra.entity.state.{entity['type']}.{entity['slug']}"
                        subject_type = f"maestra.entity.state.{entity['type']}"
                        subject_generic = "maestra.entity.state"

                        await self.nc.publish(subject_specific, payload)
                        await self.nc.publish(subject_type, payload)
                        await self.nc.publish(subject_generic, payload)
                    except Exception as exc:
                        logger.debug("NATS entity state publish failed: %s", exc)

            await session.commit()


# ---------------------------------------------------------------------------
# Module-level singleton (mirrors state_manager / stream_manager pattern)
# ---------------------------------------------------------------------------

demo_simulator = DemoSimulator()
