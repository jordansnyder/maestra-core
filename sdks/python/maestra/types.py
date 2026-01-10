"""
Type definitions for Maestra SDK
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime


@dataclass
class ConnectionConfig:
    """Configuration for connecting to Maestra services"""
    api_url: str = "http://localhost:8080"
    nats_url: Optional[str] = "nats://localhost:4222"
    mqtt_broker: Optional[str] = "localhost"
    mqtt_port: int = 1883
    client_id: Optional[str] = None


@dataclass
class EntityType:
    """Entity type definition"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    default_state: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EntityData:
    """Entity data structure"""
    id: str
    name: str
    slug: str
    entity_type_id: str
    entity_type_name: Optional[str] = None
    parent_id: Optional[str] = None
    path: Optional[str] = None
    state: Dict[str, Any] = field(default_factory=dict)
    state_updated_at: Optional[datetime] = None
    status: str = "active"
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    device_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class StateChangeEvent:
    """Event fired when entity state changes"""
    type: str
    entity_id: str
    entity_slug: str
    entity_type: str
    path: Optional[str]
    previous_state: Dict[str, Any]
    current_state: Dict[str, Any]
    changed_keys: List[str]
    source: Optional[str]
    timestamp: datetime


# Type aliases for callbacks
StateChangeCallback = Callable[[StateChangeEvent], None]
EntityCallback = Callable[["EntityData"], None]
