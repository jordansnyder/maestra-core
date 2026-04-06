"""
State Manager Service
Handles state updates and event broadcasting to NATS and MQTT message buses.
Also processes incoming MQTT state update commands from devices (Arduino, ESP32, etc.).
"""

import json
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from uuid import UUID
import os

import nats
from nats.aio.client import Client as NATS
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


@dataclass
class EntityCacheEntry:
    """Cached entity metadata for fast slug lookups."""
    entity_id: UUID
    entity_type: str
    entity_path: Optional[str]
    entity_metadata: Optional[dict]
    device_id: Optional[UUID]

# Async event loop reference — set during connect() so MQTT thread callbacks
# can schedule coroutines on the main loop.
_loop: Optional[asyncio.AbstractEventLoop] = None


class StateManager:
    """
    Manages entity state updates and event broadcasting.
    Publishes state change events to both NATS and MQTT for maximum compatibility.
    """

    def __init__(
        self,
        nats_url: str = None,
        mqtt_broker: str = None,
        mqtt_port: int = 1883
    ):
        self.nats_url = nats_url or os.getenv('NATS_URL', 'nats://nats:4222')
        self.mqtt_broker = mqtt_broker or os.getenv('MQTT_BROKER', 'mosquitto')
        self.mqtt_port = mqtt_port
        self.nc: Optional[NATS] = None
        self.mqtt_client: Optional[mqtt.Client] = None
        self._connected = False
        self._message_handlers: List[Callable] = []
        self._entity_cache: Dict[str, EntityCacheEntry] = {}  # slug -> cached entity info

    async def connect(self) -> bool:
        """Connect to NATS and MQTT brokers"""
        global _loop
        _loop = asyncio.get_running_loop()
        success = True

        # Connect to NATS
        try:
            self.nc = await nats.connect(self.nats_url)
            logger.info(f"NATS connected: {self.nats_url}")
        except Exception as e:
            logger.warning(f"NATS connection failed: {e}")
            self.nc = None
            success = False

        # Connect to MQTT
        try:
            self.mqtt_client = mqtt.Client(
                client_id="fleet-manager-state",
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2
            )
            self.mqtt_client.on_connect = self._on_mqtt_connect
            self.mqtt_client.on_connect_fail = lambda client, userdata: logger.warning("MQTT connection failed")
            self.mqtt_client.on_message = self._on_mqtt_message
            self.mqtt_client.connect_async(self.mqtt_broker, self.mqtt_port)
            self.mqtt_client.loop_start()
            logger.info(f"MQTT connecting: {self.mqtt_broker}:{self.mqtt_port}")
        except Exception as e:
            logger.warning(f"MQTT connection failed: {e}")
            self.mqtt_client = None
            success = False

        # Register built-in MQTT state update handler
        self.add_message_handler(self._handle_mqtt_state_update)

        # Subscribe to NATS state update commands
        if self.nc and not self.nc.is_closed:
            await self.nc.subscribe(
                "maestra.entity.state.update.*",
                cb=self._on_nats_state_update
            )
            await self.nc.subscribe(
                "maestra.entity.state.set.*",
                cb=self._on_nats_state_set
            )
            logger.info("NATS state update subscriptions active")

        self._connected = success
        return success

    async def disconnect(self):
        """Disconnect from message brokers"""
        if self.nc:
            await self.nc.close()
            logger.info("NATS disconnected")

        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
            logger.info("MQTT disconnected")

        self._connected = False

    def _on_mqtt_connect(self, client, userdata, flags, reason_code, properties=None):
        """MQTT connection callback"""
        if reason_code == 0:
            logger.info("MQTT connected successfully")
            # Subscribe to state update requests
            client.subscribe("maestra/entity/state/update/#")
            client.subscribe("maestra/entity/state/set/#")
        else:
            logger.warning(f"MQTT connection failed: {reason_code}")

    def _on_mqtt_message(self, client, userdata, msg):
        """Handle incoming MQTT messages (state update requests).

        This runs on the paho-mqtt network thread, so we schedule
        coroutines on the main asyncio loop via call_soon_threadsafe.
        """
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())

            # Extract operation and slug from topic
            # Format: maestra/entity/state/update/<slug> or maestra/entity/state/set/<slug>
            parts = topic.split('/')
            if len(parts) >= 5:
                operation = parts[3]  # "update" or "set"
                slug = parts[4]

                # Schedule async handlers on the main event loop
                if _loop and not _loop.is_closed():
                    for handler in self._message_handlers:
                        asyncio.run_coroutine_threadsafe(
                            handler(operation, slug, payload), _loop
                        )
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")

    def add_message_handler(self, handler: Callable):
        """Add a handler for incoming state update requests"""
        self._message_handlers.append(handler)

    async def _on_nats_state_update(self, msg):
        """Handle NATS state update command: maestra.entity.state.update.<slug>"""
        try:
            slug = msg.subject.split('.')[-1]
            payload = json.loads(msg.data.decode())
            await self._handle_mqtt_state_update("update", slug, payload)
        except Exception as e:
            logger.error(f"NATS state update error: {e}")

    async def _on_nats_state_set(self, msg):
        """Handle NATS state set command: maestra.entity.state.set.<slug>"""
        try:
            slug = msg.subject.split('.')[-1]
            payload = json.loads(msg.data.decode())
            await self._handle_mqtt_state_update("set", slug, payload)
        except Exception as e:
            logger.error(f"NATS state set error: {e}")

    async def _handle_mqtt_state_update(
        self,
        operation: str,
        slug: str,
        payload: Dict[str, Any]
    ):
        """
        Process an MQTT state update command.
        Looks up the entity by slug, updates the DB, records history,
        and broadcasts the change to all subscribers.

        Topics handled:
          maestra/entity/state/update/<slug>  →  merge (PATCH semantics)
          maestra/entity/state/set/<slug>     →  replace (PUT semantics)

        Expected payload:
          { "state": { "key": "value", ... }, "source": "optional-source-id" }
          or simply: { "key": "value", ... }  (treated as state with source="mqtt")
        """
        from database import async_session_maker, EntityDB, EntityTypeDB
        from sqlalchemy import select

        # Accept { "state": {...}, "source": "..." } or bare { "key": "value" }
        if "state" in payload and isinstance(payload["state"], dict):
            state_data = payload["state"]
            source = payload.get("source", "mqtt")
        else:
            state_data = payload
            source = "mqtt"

        if not state_data:
            logger.warning(f"MQTT state update for '{slug}': empty state payload")
            return

        try:
            # Check entity cache first
            cached = self._entity_cache.get(slug)

            async with async_session_maker() as db:
                if cached:
                    # Cache hit: only read current state from DB (skip join)
                    result = await db.execute(
                        select(EntityDB).where(EntityDB.id == cached.entity_id)
                    )
                    db_entity = result.scalar_one_or_none()
                    if not db_entity:
                        # Entity was deleted; invalidate cache
                        self._entity_cache.pop(slug, None)
                        logger.warning(f"State update: cached entity '{slug}' no longer exists")
                        return
                    entity_type_name = cached.entity_type
                    entity_path = cached.entity_path
                    entity_metadata = cached.entity_metadata
                    device_id = cached.device_id
                else:
                    # Cache miss: full lookup with join
                    result = await db.execute(
                        select(EntityDB, EntityTypeDB)
                        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
                        .where(EntityDB.slug == slug)
                    )
                    row = result.first()

                    if not row:
                        logger.warning(f"State update: entity '{slug}' not found")
                        return

                    db_entity, entity_type = row
                    entity_type_name = entity_type.name
                    entity_path = db_entity.path
                    entity_metadata = db_entity.entity_metadata
                    device_id = db_entity.device_id

                    # Populate cache
                    self._entity_cache[slug] = EntityCacheEntry(
                        entity_id=db_entity.id,
                        entity_type=entity_type_name,
                        entity_path=entity_path,
                        entity_metadata=entity_metadata,
                        device_id=device_id,
                    )

                previous_state = db_entity.state or {}

                # Apply update or replace
                if operation == "update":
                    new_state = self._deep_merge(previous_state, state_data)
                elif operation == "set":
                    new_state = state_data
                else:
                    logger.warning(f"State update: unknown operation '{operation}'")
                    return

                # Update database
                db_entity.state = new_state
                db_entity.state_updated_at = datetime.utcnow()
                await db.commit()

                # Record state history (non-fatal)
                try:
                    from entity_router import record_state_change
                    await record_state_change(
                        db, db_entity.id, db_entity.slug, entity_type_name,
                        entity_path, previous_state, new_state,
                        source=source, device_id=device_id
                    )
                except Exception as e:
                    logger.error(f"State history recording failed: {e}")

                # Broadcast to all subscribers (NATS + MQTT)
                await self.broadcast_state_change(
                    entity_id=db_entity.id,
                    entity_slug=db_entity.slug,
                    entity_type=entity_type_name,
                    entity_path=entity_path,
                    previous_state=previous_state,
                    new_state=new_state,
                    source=source,
                    entity_metadata=entity_metadata
                )

                logger.debug(
                    f"State {operation} for '{slug}': "
                    f"{list(state_data.keys())} (source={source})"
                )

        except Exception as e:
            logger.error(f"MQTT state update failed for '{slug}': {e}")

    @staticmethod
    def _deep_merge(base: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
        """Deep merge update dict into base dict"""
        result = base.copy()
        for key, value in update.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = StateManager._deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    @staticmethod
    def compute_changed_keys(
        previous: Dict[str, Any],
        current: Dict[str, Any]
    ) -> List[str]:
        """Compute which top-level keys changed between states"""
        changed = []
        all_keys = set(previous.keys()) | set(current.keys())
        for key in all_keys:
            if previous.get(key) != current.get(key):
                changed.append(key)
        return changed

    @staticmethod
    def _check_type(value: Any, expected_type: str) -> bool:
        """Check if a value matches the expected variable type"""
        type_checks = {
            "string": lambda v: isinstance(v, str),
            "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            "boolean": lambda v: isinstance(v, bool),
            "array": lambda v: isinstance(v, list),
            "color": lambda v: isinstance(v, str),
            "vector2": lambda v: isinstance(v, dict) and "x" in v and "y" in v,
            "vector3": lambda v: isinstance(v, dict) and "x" in v and "y" in v and "z" in v,
            "range": lambda v: isinstance(v, (int, float)),
            "enum": lambda v: True,
            "object": lambda v: isinstance(v, dict),
        }
        return type_checks.get(expected_type, lambda v: True)(value)

    def validate_state_against_variables(
        self,
        state: Dict[str, Any],
        variables: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Validate state values against variable definitions.
        Returns list of warnings (non-blocking).
        """
        warnings = []
        inputs = variables.get("inputs", [])
        outputs = variables.get("outputs", [])
        all_vars = {v["name"]: v for v in inputs + outputs}

        # Check each state key against definitions
        for key, value in state.items():
            if key in all_vars:
                var_def = all_vars[key]
                expected_type = var_def.get("type", "string")
                if not self._check_type(value, expected_type):
                    actual_type = type(value).__name__
                    warnings.append({
                        "variable_name": key,
                        "expected_type": expected_type,
                        "actual_type": actual_type,
                        "message": f"State key '{key}' has type '{actual_type}' but expected '{expected_type}'",
                        "severity": "warning"
                    })

        # Check for missing required inputs
        for var in inputs:
            if var.get("required") and var["name"] not in state:
                warnings.append({
                    "variable_name": var["name"],
                    "expected_type": var.get("type", "string"),
                    "actual_type": "missing",
                    "message": f"Required input '{var['name']}' is missing from state",
                    "severity": "warning"
                })

        return warnings

    async def broadcast_state_change(
        self,
        entity_id: UUID,
        entity_slug: str,
        entity_type: str,
        entity_path: Optional[str],
        previous_state: Dict[str, Any],
        new_state: Dict[str, Any],
        source: Optional[str] = None,
        entity_metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Broadcast state change event to both NATS and MQTT.
        Called after database update.
        Includes validation warnings if entity has variable definitions.
        """
        changed_keys = self.compute_changed_keys(previous_state, new_state)

        if not changed_keys:
            return  # No actual changes

        # Validate state against variable definitions if present
        validation_warnings = []
        if entity_metadata and "variables" in entity_metadata:
            validation_warnings = self.validate_state_against_variables(
                new_state,
                entity_metadata["variables"]
            )

            # Log warnings
            for warning in validation_warnings:
                logger.warning(f"Entity {entity_slug}: {warning['message']}")

        event = {
            "type": "state_changed",
            "entity_id": str(entity_id),
            "entity_slug": entity_slug,
            "entity_type": entity_type,
            "path": entity_path,
            "previous_state": {},
            "current_state": new_state,
            "changed_keys": changed_keys,
            "source": source,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "validation_warnings": validation_warnings
        }

        # Broadcast to both NATS and MQTT concurrently
        await asyncio.gather(
            self._publish_nats(entity_slug, entity_type, event),
            self._publish_mqtt(entity_slug, entity_type, event),
            return_exceptions=True
        )

    def invalidate_entity_cache(self, slug: str):
        """Remove a slug from the entity cache (call on entity CRUD)."""
        self._entity_cache.pop(slug, None)

    async def broadcast_entity_lifecycle(
        self,
        event_type: str,  # "created", "updated", "deleted"
        entity_id: UUID,
        entity_slug: str,
        entity_type: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Broadcast entity lifecycle events (create/update/delete)."""
        # Invalidate cache on any entity mutation
        self.invalidate_entity_cache(entity_slug)
        event = {
            "type": f"entity_{event_type}",
            "entity_id": str(entity_id),
            "entity_slug": entity_slug,
            "entity_type": entity_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        await asyncio.gather(
            self._publish_nats_lifecycle(event_type, entity_slug, entity_type, event),
            self._publish_mqtt_lifecycle(event_type, entity_slug, entity_type, event),
            return_exceptions=True
        )

    async def _publish_nats(
        self,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish state change to NATS.

        Publishes to a single subject: maestra.entity.state.<type>.<slug>
        Consumers use NATS wildcards for broader subscriptions:
          - maestra.entity.state.>           (all entities)
          - maestra.entity.state.<type>.*    (all of one type)
        """
        if not self.nc or self.nc.is_closed:
            return

        try:
            payload = json.dumps(event).encode()
            subject = f"maestra.entity.state.{entity_type}.{slug}"
            await self.nc.publish(subject, payload)
        except Exception as e:
            logger.error(f"NATS publish error: {e}")

    async def _publish_mqtt(
        self,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish state change to MQTT.

        Publishes to a single topic: maestra/entity/state/<type>/<slug>
        Consumers use MQTT wildcards for broader subscriptions:
          - maestra/entity/state/#              (all entities)
          - maestra/entity/state/<type>/#       (all of one type)
        """
        if not self.mqtt_client:
            return

        try:
            payload = json.dumps(event)
            topic = f"maestra/entity/state/{entity_type}/{slug}"
            self.mqtt_client.publish(topic, payload, qos=1)
        except Exception as e:
            logger.error(f"MQTT publish error: {e}")

    async def _publish_nats_lifecycle(
        self,
        event_type: str,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish lifecycle event to NATS (single subject)."""
        if not self.nc or self.nc.is_closed:
            return

        try:
            payload = json.dumps(event).encode()
            subject = f"maestra.entity.{event_type}.{entity_type}.{slug}"
            await self.nc.publish(subject, payload)
        except Exception as e:
            logger.error(f"NATS lifecycle publish error: {e}")

    async def _publish_mqtt_lifecycle(
        self,
        event_type: str,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish lifecycle event to MQTT (single topic)."""
        if not self.mqtt_client:
            return

        try:
            payload = json.dumps(event)
            topic = f"maestra/entity/{event_type}/{entity_type}/{slug}"
            self.mqtt_client.publish(topic, payload, qos=1)
        except Exception as e:
            logger.error(f"MQTT lifecycle publish error: {e}")

    async def subscribe_nats(self, subject: str, callback: Callable):
        """Subscribe to NATS subject"""
        if self.nc and not self.nc.is_closed:
            await self.nc.subscribe(subject, cb=callback)

    @property
    def is_connected(self) -> bool:
        """Check if connected to message brokers"""
        return self._connected


# Global state manager instance
state_manager = StateManager()
