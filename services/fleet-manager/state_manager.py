"""
State Manager Service
Handles state updates and event broadcasting to NATS and MQTT message buses
"""

import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from uuid import UUID
import os

import nats
from nats.aio.client import Client as NATS
import paho.mqtt.client as mqtt


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

    async def connect(self) -> bool:
        """Connect to NATS and MQTT brokers"""
        success = True

        # Connect to NATS
        try:
            self.nc = await nats.connect(self.nats_url)
            print(f"✅ NATS connected: {self.nats_url}")
        except Exception as e:
            print(f"⚠️ NATS connection failed: {e}")
            self.nc = None
            success = False

        # Connect to MQTT
        try:
            self.mqtt_client = mqtt.Client(
                client_id="fleet-manager-state",
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2
            )
            self.mqtt_client.on_connect = self._on_mqtt_connect
            self.mqtt_client.on_message = self._on_mqtt_message
            self.mqtt_client.connect_async(self.mqtt_broker, self.mqtt_port)
            self.mqtt_client.loop_start()
            print(f"✅ MQTT connecting: {self.mqtt_broker}:{self.mqtt_port}")
        except Exception as e:
            print(f"⚠️ MQTT connection failed: {e}")
            self.mqtt_client = None
            success = False

        self._connected = success
        return success

    async def disconnect(self):
        """Disconnect from message brokers"""
        if self.nc:
            await self.nc.close()
            print("📴 NATS disconnected")

        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
            print("📴 MQTT disconnected")

        self._connected = False

    def _on_mqtt_connect(self, client, userdata, flags, reason_code, properties=None):
        """MQTT connection callback"""
        if reason_code == 0:
            print("✅ MQTT connected successfully")
            # Subscribe to state update requests
            client.subscribe("maestra/entity/state/update/#")
            client.subscribe("maestra/entity/state/set/#")
        else:
            print(f"⚠️ MQTT connection failed: {reason_code}")

    def _on_mqtt_message(self, client, userdata, msg):
        """Handle incoming MQTT messages (state update requests)"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())

            # Extract slug from topic
            # Format: maestra/entity/state/update/<slug> or maestra/entity/state/set/<slug>
            parts = topic.split('/')
            if len(parts) >= 5:
                operation = parts[3]  # "update" or "set"
                slug = parts[4]

                # Queue for async processing
                for handler in self._message_handlers:
                    asyncio.create_task(handler(operation, slug, payload))
        except Exception as e:
            print(f"⚠️ Error processing MQTT message: {e}")

    def add_message_handler(self, handler: Callable):
        """Add a handler for incoming state update requests"""
        self._message_handlers.append(handler)

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

    async def broadcast_state_change(
        self,
        entity_id: UUID,
        entity_slug: str,
        entity_type: str,
        entity_path: Optional[str],
        previous_state: Dict[str, Any],
        new_state: Dict[str, Any],
        source: Optional[str] = None
    ):
        """
        Broadcast state change event to both NATS and MQTT.
        Called after database update.
        """
        changed_keys = self.compute_changed_keys(previous_state, new_state)

        if not changed_keys:
            return  # No actual changes

        event = {
            "type": "state_changed",
            "entity_id": str(entity_id),
            "entity_slug": entity_slug,
            "entity_type": entity_type,
            "path": entity_path,
            "previous_state": previous_state,
            "current_state": new_state,
            "changed_keys": changed_keys,
            "source": source,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        # Broadcast to both NATS and MQTT concurrently
        await asyncio.gather(
            self._publish_nats(entity_slug, entity_type, event),
            self._publish_mqtt(entity_slug, entity_type, event),
            return_exceptions=True
        )

    async def broadcast_entity_lifecycle(
        self,
        event_type: str,  # "created", "updated", "deleted"
        entity_id: UUID,
        entity_slug: str,
        entity_type: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Broadcast entity lifecycle events (create/update/delete)"""
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
        """Publish state change to NATS"""
        if not self.nc or self.nc.is_closed:
            return

        try:
            payload = json.dumps(event).encode()

            # Publish to specific entity subject
            # Pattern: maestra.entity.state.<type>.<slug>
            subject = f"maestra.entity.state.{entity_type}.{slug}"
            await self.nc.publish(subject, payload)

            # Also publish to generic state channel for broad subscriptions
            await self.nc.publish("maestra.entity.state", payload)

            # Type-level subscription
            await self.nc.publish(f"maestra.entity.state.{entity_type}", payload)

        except Exception as e:
            print(f"⚠️ NATS publish error: {e}")

    async def _publish_mqtt(
        self,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish state change to MQTT"""
        if not self.mqtt_client:
            return

        try:
            payload = json.dumps(event)

            # Topic pattern: maestra/entity/state/<type>/<slug>
            topic = f"maestra/entity/state/{entity_type}/{slug}"
            self.mqtt_client.publish(topic, payload, qos=1)

            # Generic topic for broad subscriptions
            self.mqtt_client.publish("maestra/entity/state", payload, qos=1)

            # Type-level topic
            self.mqtt_client.publish(f"maestra/entity/state/{entity_type}", payload, qos=1)

        except Exception as e:
            print(f"⚠️ MQTT publish error: {e}")

    async def _publish_nats_lifecycle(
        self,
        event_type: str,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish lifecycle event to NATS"""
        if not self.nc or self.nc.is_closed:
            return

        try:
            payload = json.dumps(event).encode()
            subject = f"maestra.entity.{event_type}.{entity_type}.{slug}"
            await self.nc.publish(subject, payload)
            await self.nc.publish(f"maestra.entity.{event_type}", payload)
        except Exception as e:
            print(f"⚠️ NATS lifecycle publish error: {e}")

    async def _publish_mqtt_lifecycle(
        self,
        event_type: str,
        slug: str,
        entity_type: str,
        event: Dict[str, Any]
    ):
        """Publish lifecycle event to MQTT"""
        if not self.mqtt_client:
            return

        try:
            payload = json.dumps(event)
            topic = f"maestra/entity/{event_type}/{entity_type}/{slug}"
            self.mqtt_client.publish(topic, payload, qos=1)
            self.mqtt_client.publish(f"maestra/entity/{event_type}", payload, qos=1)
        except Exception as e:
            print(f"⚠️ MQTT lifecycle publish error: {e}")

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
