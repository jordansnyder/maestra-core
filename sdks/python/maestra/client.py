"""
Maestra Client - Main entry point for the SDK
"""

import asyncio
import json
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
import uuid

from .types import ConnectionConfig, EntityData, EntityType, StateChangeEvent
from .entity import Entity


class HttpTransport:
    """HTTP transport for REST API calls"""

    def __init__(self, api_url: str):
        self.api_url = api_url.rstrip('/')
        self._session = None

    async def _ensure_session(self):
        if self._session is None:
            import aiohttp
            self._session = aiohttp.ClientSession()

    async def close(self):
        if self._session:
            await self._session.close()
            self._session = None

    async def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        await self._ensure_session()
        url = f"{self.api_url}{endpoint}"

        async with self._session.request(method, url, **kwargs) as response:
            if response.status >= 400:
                text = await response.text()
                raise Exception(f"API error {response.status}: {text}")
            return await response.json()

    # Entity Types
    async def list_entity_types(self) -> List[Dict[str, Any]]:
        return await self._request("GET", "/entities/types")

    async def get_entity_type(self, type_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/entities/types/{type_id}")

    # Entities
    async def list_entities(
        self,
        entity_type: Optional[str] = None,
        parent_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        params = {"limit": limit, "offset": offset}
        if entity_type:
            params["entity_type"] = entity_type
        if parent_id:
            params["parent_id"] = parent_id
        if status:
            params["status"] = status
        if search:
            params["search"] = search

        return await self._request("GET", "/entities", params=params)

    async def get_entity(self, entity_id: str, include_children: bool = False) -> Dict[str, Any]:
        params = {"include_children": "true"} if include_children else {}
        return await self._request("GET", f"/entities/{entity_id}", params=params)

    async def get_entity_by_slug(self, slug: str) -> Dict[str, Any]:
        return await self._request("GET", f"/entities/by-slug/{slug}")

    async def create_entity(
        self,
        name: str,
        entity_type_id: str,
        slug: Optional[str] = None,
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        state: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        data = {
            "name": name,
            "entity_type_id": entity_type_id,
        }
        if slug:
            data["slug"] = slug
        if parent_id:
            data["parent_id"] = parent_id
        if description:
            data["description"] = description
        if tags:
            data["tags"] = tags
        if metadata:
            data["metadata"] = metadata
        if state:
            data["state"] = state

        return await self._request("POST", "/entities", json=data)

    async def update_entity(
        self,
        entity_id: str,
        name: Optional[str] = None,
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        data = {}
        if name is not None:
            data["name"] = name
        if parent_id is not None:
            data["parent_id"] = parent_id
        if description is not None:
            data["description"] = description
        if status is not None:
            data["status"] = status
        if tags is not None:
            data["tags"] = tags
        if metadata is not None:
            data["metadata"] = metadata

        return await self._request("PUT", f"/entities/{entity_id}", json=data)

    async def delete_entity(self, entity_id: str, cascade: bool = False) -> Dict[str, Any]:
        params = {"cascade": "true"} if cascade else {}
        return await self._request("DELETE", f"/entities/{entity_id}", params=params)

    # Hierarchy
    async def get_ancestors(self, entity_id: str) -> List[Dict[str, Any]]:
        return await self._request("GET", f"/entities/{entity_id}/ancestors")

    async def get_descendants(self, entity_id: str, max_depth: int = 10) -> List[Dict[str, Any]]:
        return await self._request("GET", f"/entities/{entity_id}/descendants", params={"max_depth": max_depth})

    async def get_tree(
        self,
        root_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        max_depth: int = 5,
    ) -> List[Dict[str, Any]]:
        params = {"max_depth": max_depth}
        if root_id:
            params["root_id"] = root_id
        if entity_type:
            params["entity_type"] = entity_type
        return await self._request("GET", "/entities/tree", params=params)

    # State
    async def get_state(self, entity_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/entities/{entity_id}/state")

    async def update_state(
        self,
        entity_id: str,
        state: Dict[str, Any],
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        data = {"state": state}
        if source:
            data["source"] = source
        return await self._request("PATCH", f"/entities/{entity_id}/state", json=data)

    async def set_state(
        self,
        entity_id: str,
        state: Dict[str, Any],
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        data = {"state": state}
        if source:
            data["source"] = source
        return await self._request("PUT", f"/entities/{entity_id}/state", json=data)


class MaestraClient:
    """
    Main client for interacting with Maestra.
    Supports HTTP REST API, NATS, and MQTT transports.
    """

    def __init__(self, config: Optional[ConnectionConfig] = None):
        self.config = config or ConnectionConfig()
        self._http = HttpTransport(self.config.api_url)
        self._nats = None
        self._mqtt = None
        self._connected = False
        self._subscribed_entities: Dict[str, Entity] = {}
        self._client_id = self.config.client_id or f"maestra-py-{uuid.uuid4().hex[:8]}"

    async def connect(self) -> None:
        """Connect to Maestra services"""
        # HTTP is always available
        print(f"🔌 Connecting to Maestra API: {self.config.api_url}")

        # Try NATS connection
        if self.config.nats_url:
            try:
                import nats
                self._nats = await nats.connect(self.config.nats_url)
                print(f"✅ NATS connected: {self.config.nats_url}")
            except Exception as e:
                print(f"⚠️ NATS connection failed: {e}")
                self._nats = None

        # Try MQTT connection
        if self.config.mqtt_broker:
            try:
                import paho.mqtt.client as mqtt

                self._mqtt = mqtt.Client(
                    client_id=self._client_id,
                    callback_api_version=mqtt.CallbackAPIVersion.VERSION2
                )
                self._mqtt.on_message = self._on_mqtt_message

                # Connect synchronously for simplicity
                self._mqtt.connect(self.config.mqtt_broker, self.config.mqtt_port)
                self._mqtt.loop_start()
                print(f"✅ MQTT connected: {self.config.mqtt_broker}:{self.config.mqtt_port}")
            except Exception as e:
                print(f"⚠️ MQTT connection failed: {e}")
                self._mqtt = None

        self._connected = True
        print("✅ Maestra client ready!")

    async def disconnect(self) -> None:
        """Disconnect from all services"""
        if self._nats:
            await self._nats.close()
            self._nats = None

        if self._mqtt:
            self._mqtt.loop_stop()
            self._mqtt.disconnect()
            self._mqtt = None

        await self._http.close()
        self._connected = False
        print("👋 Disconnected from Maestra")

    @property
    def is_connected(self) -> bool:
        return self._connected

    # Entity Types
    async def get_entity_types(self) -> List[EntityType]:
        """Get all entity types"""
        data = await self._http.list_entity_types()
        return [self._parse_entity_type(t) for t in data]

    async def get_entity_type(self, type_id: str) -> EntityType:
        """Get entity type by ID"""
        data = await self._http.get_entity_type(type_id)
        return self._parse_entity_type(data)

    # Entities
    async def get_entities(
        self,
        entity_type: Optional[str] = None,
        parent_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
    ) -> List[Entity]:
        """Get entities with optional filtering"""
        data = await self._http.list_entities(
            entity_type=entity_type,
            parent_id=parent_id,
            status=status,
            search=search,
            limit=limit,
        )
        return [Entity(self, self._parse_entity_data(e)) for e in data]

    async def get_entity(self, entity_id: str) -> Entity:
        """Get entity by ID"""
        data = await self._http.get_entity(entity_id)
        return Entity(self, self._parse_entity_data(data))

    async def get_entity_by_slug(self, slug: str) -> Entity:
        """Get entity by slug"""
        data = await self._http.get_entity_by_slug(slug)
        return Entity(self, self._parse_entity_data(data))

    async def create_entity(
        self,
        name: str,
        entity_type_id: str,
        slug: Optional[str] = None,
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        state: Optional[Dict[str, Any]] = None,
    ) -> Entity:
        """Create a new entity"""
        data = await self._http.create_entity(
            name=name,
            entity_type_id=entity_type_id,
            slug=slug,
            parent_id=parent_id,
            description=description,
            tags=tags,
            metadata=metadata,
            state=state,
        )
        return Entity(self, self._parse_entity_data(data))

    async def delete_entity(self, entity_id: str, cascade: bool = False) -> None:
        """Delete an entity"""
        await self._http.delete_entity(entity_id, cascade)

    # Hierarchy
    async def get_ancestors(self, entity_id: str) -> List[Entity]:
        """Get ancestor entities"""
        data = await self._http.get_ancestors(entity_id)
        return [Entity(self, self._parse_entity_data(e)) for e in data]

    async def get_descendants(self, entity_id: str, max_depth: int = 10) -> List[Entity]:
        """Get descendant entities"""
        data = await self._http.get_descendants(entity_id, max_depth)
        return [Entity(self, self._parse_entity_data(e)) for e in data]

    async def get_tree(
        self,
        root_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        max_depth: int = 5,
    ) -> List[Dict[str, Any]]:
        """Get entity tree"""
        return await self._http.get_tree(root_id, entity_type, max_depth)

    # Subscriptions
    async def _subscribe_entity(self, entity: Entity) -> None:
        """Subscribe to entity state changes"""
        self._subscribed_entities[entity.slug] = entity

        # Subscribe via NATS
        if self._nats:
            subject = f"maestra.entity.state.*.{entity.slug}"
            await self._nats.subscribe(subject, cb=self._on_nats_message)

        # Subscribe via MQTT
        if self._mqtt:
            topic = f"maestra/entity/state/+/{entity.slug}"
            self._mqtt.subscribe(topic, qos=1)

    async def _unsubscribe_entity(self, entity: Entity) -> None:
        """Unsubscribe from entity state changes"""
        if entity.slug in self._subscribed_entities:
            del self._subscribed_entities[entity.slug]

        # Note: NATS/MQTT unsubscription would need subscription handles

    async def _on_nats_message(self, msg) -> None:
        """Handle incoming NATS message"""
        try:
            data = json.loads(msg.data.decode())
            self._handle_state_event(data)
        except Exception as e:
            print(f"Error handling NATS message: {e}")

    def _on_mqtt_message(self, client, userdata, msg) -> None:
        """Handle incoming MQTT message"""
        try:
            data = json.loads(msg.payload.decode())
            self._handle_state_event(data)
        except Exception as e:
            print(f"Error handling MQTT message: {e}")

    def _handle_state_event(self, data: Dict[str, Any]) -> None:
        """Process state change event"""
        if data.get("type") != "state_changed":
            return

        slug = data.get("entity_slug")
        if slug in self._subscribed_entities:
            event = StateChangeEvent(
                type=data["type"],
                entity_id=data["entity_id"],
                entity_slug=data["entity_slug"],
                entity_type=data["entity_type"],
                path=data.get("path"),
                previous_state=data["previous_state"],
                current_state=data["current_state"],
                changed_keys=data["changed_keys"],
                source=data.get("source"),
                timestamp=datetime.fromisoformat(data["timestamp"].rstrip("Z")),
            )
            self._subscribed_entities[slug]._handle_state_event(event)

    # Parsing helpers
    def _parse_entity_type(self, data: Dict[str, Any]) -> EntityType:
        return EntityType(
            id=data["id"],
            name=data["name"],
            display_name=data["display_name"],
            description=data.get("description"),
            icon=data.get("icon"),
            default_state=data.get("default_state", {}),
            metadata=data.get("metadata", {}),
        )

    def _parse_entity_data(self, data: Dict[str, Any]) -> EntityData:
        entity_type = data.get("entity_type")
        return EntityData(
            id=data["id"],
            name=data["name"],
            slug=data["slug"],
            entity_type_id=data["entity_type_id"],
            entity_type_name=entity_type["name"] if entity_type else None,
            parent_id=data.get("parent_id"),
            path=data.get("path"),
            state=data.get("state", {}),
            state_updated_at=datetime.fromisoformat(data["state_updated_at"].rstrip("Z")) if data.get("state_updated_at") else None,
            status=data.get("status", "active"),
            description=data.get("description"),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {}),
            device_id=data.get("device_id"),
            created_at=datetime.fromisoformat(data["created_at"].rstrip("Z")) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"].rstrip("Z")) if data.get("updated_at") else None,
        )


# Convenience function for quick connection
async def connect(
    api_url: str = "http://localhost:8080",
    nats_url: Optional[str] = "nats://localhost:4222",
    mqtt_broker: Optional[str] = "localhost",
) -> MaestraClient:
    """Quick connect to Maestra"""
    client = MaestraClient(ConnectionConfig(
        api_url=api_url,
        nats_url=nats_url,
        mqtt_broker=mqtt_broker,
    ))
    await client.connect()
    return client
