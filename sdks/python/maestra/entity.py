"""
Entity and EntityState classes for Maestra SDK
"""

from typing import Dict, Any, Optional, List, Callable, TYPE_CHECKING
from datetime import datetime
import asyncio
import json

from .types import EntityData, StateChangeEvent, StateChangeCallback

if TYPE_CHECKING:
    from .client import MaestraClient


class EntityState:
    """
    Reactive state container for an entity.
    Provides get/set operations and change subscriptions.
    """

    def __init__(self, entity: "Entity", initial_state: Dict[str, Any]):
        self._entity = entity
        self._state = initial_state.copy()
        self._callbacks: List[StateChangeCallback] = []

    @property
    def data(self) -> Dict[str, Any]:
        """Get the current state dictionary"""
        return self._state.copy()

    def get(self, key: str, default: Any = None) -> Any:
        """Get a specific state value"""
        return self._state.get(key, default)

    def __getitem__(self, key: str) -> Any:
        """Dictionary-style access to state values"""
        return self._state[key]

    def __contains__(self, key: str) -> bool:
        """Check if key exists in state"""
        return key in self._state

    async def set(self, key: str, value: Any, source: Optional[str] = None) -> None:
        """Set a single state value"""
        await self.update({key: value}, source)

    async def update(self, updates: Dict[str, Any], source: Optional[str] = None) -> None:
        """Update multiple state values (merge)"""
        await self._entity._update_state(updates, source, replace=False)

    async def replace(self, new_state: Dict[str, Any], source: Optional[str] = None) -> None:
        """Replace entire state"""
        await self._entity._update_state(new_state, source, replace=True)

    def on_change(self, callback: StateChangeCallback) -> Callable[[], None]:
        """
        Subscribe to state changes.
        Returns unsubscribe function.
        """
        self._callbacks.append(callback)

        def unsubscribe():
            if callback in self._callbacks:
                self._callbacks.remove(callback)

        return unsubscribe

    def _apply_update(self, event: StateChangeEvent) -> None:
        """Internal: Apply state update from event"""
        self._state = event.current_state.copy()

        # Notify callbacks
        for callback in self._callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"Error in state change callback: {e}")


class Entity:
    """
    Represents a Maestra entity with state management.
    Provides CRUD operations and real-time state synchronization.
    """

    def __init__(self, client: "MaestraClient", data: EntityData):
        self._client = client
        self._data = data
        self.state = EntityState(self, data.state)
        self._subscribed = False

    @property
    def id(self) -> str:
        return self._data.id

    @property
    def name(self) -> str:
        return self._data.name

    @property
    def slug(self) -> str:
        return self._data.slug

    @property
    def entity_type_id(self) -> str:
        return self._data.entity_type_id

    @property
    def entity_type_name(self) -> Optional[str]:
        return self._data.entity_type_name

    @property
    def parent_id(self) -> Optional[str]:
        return self._data.parent_id

    @property
    def path(self) -> Optional[str]:
        return self._data.path

    @property
    def status(self) -> str:
        return self._data.status

    @property
    def description(self) -> Optional[str]:
        return self._data.description

    @property
    def tags(self) -> List[str]:
        return self._data.tags

    @property
    def metadata(self) -> Dict[str, Any]:
        return self._data.metadata

    @property
    def created_at(self) -> Optional[datetime]:
        return self._data.created_at

    @property
    def updated_at(self) -> Optional[datetime]:
        return self._data.updated_at

    async def refresh(self) -> None:
        """Refresh entity data from server"""
        updated = await self._client.get_entity(self.id)
        self._data = updated._data
        self.state._state = updated._data.state.copy()

    async def save(self) -> None:
        """Save entity metadata changes to server"""
        await self._client._http.update_entity(
            self.id,
            name=self.name,
            description=self.description,
            status=self.status,
            tags=self.tags,
            metadata=self.metadata,
        )

    async def delete(self, cascade: bool = False) -> None:
        """Delete this entity"""
        await self._client._http.delete_entity(self.id, cascade)

    async def get_ancestors(self) -> List["Entity"]:
        """Get all ancestor entities"""
        return await self._client.get_ancestors(self.id)

    async def get_descendants(self, max_depth: int = 10) -> List["Entity"]:
        """Get all descendant entities"""
        return await self._client.get_descendants(self.id, max_depth)

    async def get_children(self) -> List["Entity"]:
        """Get immediate children"""
        return await self._client.get_entities(parent_id=self.id)

    async def subscribe(self) -> None:
        """Subscribe to real-time state updates via message bus"""
        if self._subscribed:
            return

        await self._client._subscribe_entity(self)
        self._subscribed = True

    async def unsubscribe(self) -> None:
        """Unsubscribe from real-time updates"""
        if not self._subscribed:
            return

        await self._client._unsubscribe_entity(self)
        self._subscribed = False

    async def _update_state(
        self,
        state: Dict[str, Any],
        source: Optional[str] = None,
        replace: bool = False
    ) -> None:
        """Internal: Update state via API"""
        if replace:
            await self._client._http.set_state(self.id, state, source)
        else:
            await self._client._http.update_state(self.id, state, source)

        # Optimistically update local state
        if replace:
            self.state._state = state.copy()
        else:
            self.state._state.update(state)

    def _handle_state_event(self, event: StateChangeEvent) -> None:
        """Internal: Handle incoming state change event"""
        self.state._apply_update(event)

    def to_dict(self) -> Dict[str, Any]:
        """Convert entity to dictionary"""
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "entity_type_id": self.entity_type_id,
            "entity_type_name": self.entity_type_name,
            "parent_id": self.parent_id,
            "path": self.path,
            "state": self.state.data,
            "status": self.status,
            "description": self.description,
            "tags": self.tags,
            "metadata": self.metadata,
        }

    def __repr__(self) -> str:
        return f"Entity(id={self.id}, name={self.name}, slug={self.slug})"
