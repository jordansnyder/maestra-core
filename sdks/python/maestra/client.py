"""
Maestra Client - Main entry point for the SDK
"""

import asyncio
import json
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
import uuid

from .types import (
    ConnectionConfig, EntityData, EntityType, StateChangeEvent,
    StreamTypeData, StreamData, StreamAdvertiseParams, StreamRequestParams,
    StreamOffer, StreamSessionData, StreamSessionHistoryData, StreamRegistryStateData,
)
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

    # Streams
    async def get_stream_state(self) -> Dict[str, Any]:
        return await self._request("GET", "/streams/state")

    async def list_stream_types(self) -> List[Dict[str, Any]]:
        return await self._request("GET", "/streams/types")

    async def create_stream_type(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/streams/types", json=data)

    async def list_streams(self, stream_type: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {}
        if stream_type:
            params["stream_type"] = stream_type
        return await self._request("GET", "/streams", params=params)

    async def get_stream(self, stream_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/streams/{stream_id}")

    async def advertise_stream(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/streams/advertise", json=data)

    async def withdraw_stream(self, stream_id: str) -> Dict[str, Any]:
        return await self._request("DELETE", f"/streams/{stream_id}")

    async def stream_heartbeat(self, stream_id: str) -> Dict[str, Any]:
        return await self._request("POST", f"/streams/{stream_id}/heartbeat")

    async def request_stream(self, stream_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", f"/streams/{stream_id}/request", json=data)

    async def list_sessions(self, stream_id: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {}
        if stream_id:
            params["stream_id"] = stream_id
        return await self._request("GET", "/streams/sessions", params=params)

    async def get_session_history(
        self,
        stream_id: Optional[str] = None,
        publisher_id: Optional[str] = None,
        consumer_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"limit": limit}
        if stream_id:
            params["stream_id"] = stream_id
        if publisher_id:
            params["publisher_id"] = publisher_id
        if consumer_id:
            params["consumer_id"] = consumer_id
        return await self._request("GET", "/streams/sessions/history", params=params)

    async def stop_session(self, session_id: str) -> Dict[str, Any]:
        return await self._request("DELETE", f"/streams/sessions/{session_id}")

    async def session_heartbeat(self, session_id: str) -> Dict[str, Any]:
        return await self._request("POST", f"/streams/sessions/{session_id}/heartbeat")


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

    # ===== Streams =====

    async def get_stream_registry_state(self) -> StreamRegistryStateData:
        """Get complete stream state: streams, sessions, and types"""
        data = await self._http.get_stream_state()
        return StreamRegistryStateData(
            streams=[self._parse_stream_data(s) for s in data.get("streams", [])],
            sessions=[self._parse_session_data(s) for s in data.get("sessions", [])],
            stream_types=[self._parse_stream_type(t) for t in data.get("stream_types", [])],
        )

    async def get_stream_types(self) -> List[StreamTypeData]:
        """List all stream type definitions"""
        data = await self._http.list_stream_types()
        return [self._parse_stream_type(t) for t in data]

    async def create_stream_type(
        self,
        name: str,
        display_name: str,
        description: Optional[str] = None,
        icon: Optional[str] = None,
        default_config: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> StreamTypeData:
        """Create a custom stream type"""
        body: Dict[str, Any] = {"name": name, "display_name": display_name}
        if description:
            body["description"] = description
        if icon:
            body["icon"] = icon
        if default_config:
            body["default_config"] = default_config
        if metadata:
            body["metadata"] = metadata
        data = await self._http.create_stream_type(body)
        return self._parse_stream_type(data)

    async def get_streams(self, stream_type: Optional[str] = None) -> List[StreamData]:
        """List active streams, optionally filtered by type"""
        data = await self._http.list_streams(stream_type)
        return [self._parse_stream_data(s) for s in data]

    async def get_stream(self, stream_id: str) -> StreamData:
        """Get a single stream by ID"""
        data = await self._http.get_stream(stream_id)
        return self._parse_stream_data(data)

    async def advertise_stream(self, params: StreamAdvertiseParams) -> StreamData:
        """Advertise a new stream to the registry"""
        body: Dict[str, Any] = {
            "name": params.name,
            "stream_type": params.stream_type,
            "publisher_id": params.publisher_id,
            "protocol": params.protocol,
            "address": params.address,
            "port": params.port,
        }
        if params.entity_id:
            body["entity_id"] = params.entity_id
        if params.device_id:
            body["device_id"] = params.device_id
        if params.config:
            body["config"] = params.config
        if params.metadata:
            body["metadata"] = params.metadata
        data = await self._http.advertise_stream(body)
        return self._parse_stream_data(data)

    async def withdraw_stream(self, stream_id: str) -> None:
        """Withdraw a stream from the registry"""
        await self._http.withdraw_stream(stream_id)

    async def stream_heartbeat(self, stream_id: str) -> None:
        """Refresh a stream's TTL"""
        await self._http.stream_heartbeat(stream_id)

    async def request_stream(self, stream_id: str, params: StreamRequestParams) -> StreamOffer:
        """Request to consume a stream. Returns connection offer from the publisher."""
        body: Dict[str, Any] = {
            "consumer_id": params.consumer_id,
            "consumer_address": params.consumer_address,
        }
        if params.consumer_port is not None:
            body["consumer_port"] = params.consumer_port
        if params.config:
            body["config"] = params.config
        data = await self._http.request_stream(stream_id, body)
        return StreamOffer(
            session_id=data["session_id"],
            stream_id=data["stream_id"],
            stream_name=data["stream_name"],
            stream_type=data["stream_type"],
            protocol=data["protocol"],
            publisher_address=data["publisher_address"],
            publisher_port=data["publisher_port"],
            transport_config=data.get("transport_config", {}),
        )

    async def get_sessions(self, stream_id: Optional[str] = None) -> List[StreamSessionData]:
        """List active sessions"""
        data = await self._http.list_sessions(stream_id)
        return [self._parse_session_data(s) for s in data]

    async def get_session_history(
        self,
        stream_id: Optional[str] = None,
        publisher_id: Optional[str] = None,
        consumer_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[StreamSessionHistoryData]:
        """Query historical sessions from the database"""
        data = await self._http.get_session_history(
            stream_id=stream_id,
            publisher_id=publisher_id,
            consumer_id=consumer_id,
            limit=limit,
        )
        return [self._parse_session_history(s) for s in data]

    async def stop_session(self, session_id: str) -> None:
        """Stop an active session"""
        await self._http.stop_session(session_id)

    async def session_heartbeat(self, session_id: str) -> None:
        """Refresh a session's TTL"""
        await self._http.session_heartbeat(session_id)

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

    # Stream parsing helpers
    def _parse_stream_type(self, data: Dict[str, Any]) -> StreamTypeData:
        return StreamTypeData(
            id=data["id"],
            name=data["name"],
            display_name=data["display_name"],
            description=data.get("description"),
            icon=data.get("icon"),
            default_config=data.get("default_config", {}),
            metadata=data.get("metadata", {}),
            created_at=datetime.fromisoformat(data["created_at"].rstrip("Z")) if data.get("created_at") else None,
            updated_at=datetime.fromisoformat(data["updated_at"].rstrip("Z")) if data.get("updated_at") else None,
        )

    def _parse_stream_data(self, data: Dict[str, Any]) -> StreamData:
        return StreamData(
            id=data["id"],
            name=data["name"],
            stream_type=data["stream_type"],
            publisher_id=data["publisher_id"],
            protocol=data["protocol"],
            address=data["address"],
            port=data["port"],
            entity_id=data.get("entity_id"),
            device_id=data.get("device_id"),
            config=data.get("config", {}),
            metadata=data.get("metadata", {}),
            advertised_at=datetime.fromisoformat(data["advertised_at"].rstrip("Z")) if data.get("advertised_at") else None,
            last_heartbeat=datetime.fromisoformat(data["last_heartbeat"].rstrip("Z")) if data.get("last_heartbeat") else None,
            active_sessions=data.get("active_sessions", 0),
        )

    def _parse_session_data(self, data: Dict[str, Any]) -> StreamSessionData:
        return StreamSessionData(
            session_id=data["session_id"],
            stream_id=data["stream_id"],
            stream_name=data["stream_name"],
            stream_type=data["stream_type"],
            publisher_id=data["publisher_id"],
            publisher_address=data.get("publisher_address", ""),
            consumer_id=data["consumer_id"],
            consumer_address=data.get("consumer_address", ""),
            protocol=data.get("protocol", ""),
            transport_config=data.get("transport_config", {}),
            started_at=datetime.fromisoformat(data["started_at"].rstrip("Z")) if data.get("started_at") else None,
            status=data.get("status", "active"),
        )

    def _parse_session_history(self, data: Dict[str, Any]) -> StreamSessionHistoryData:
        return StreamSessionHistoryData(
            time=datetime.fromisoformat(data["time"].rstrip("Z")),
            session_id=data["session_id"],
            stream_id=data["stream_id"],
            stream_name=data["stream_name"],
            stream_type=data["stream_type"],
            publisher_id=data["publisher_id"],
            consumer_id=data["consumer_id"],
            protocol=data["protocol"],
            status=data["status"],
            duration_seconds=data.get("duration_seconds"),
            bytes_transferred=data.get("bytes_transferred", 0),
            error_message=data.get("error_message"),
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
