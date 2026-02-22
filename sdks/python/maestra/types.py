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


# ===== Stream Types =====


@dataclass
class StreamTypeData:
    """Stream type definition"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    default_config: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class StreamData:
    """Stream information from the registry"""
    id: str
    name: str
    stream_type: str
    publisher_id: str
    protocol: str
    address: str
    port: int
    entity_id: Optional[str] = None
    device_id: Optional[str] = None
    config: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    advertised_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    active_sessions: int = 0


@dataclass
class StreamAdvertiseParams:
    """Parameters for advertising a stream"""
    name: str
    stream_type: str  # ndi, audio, video, texture, sensor, osc, midi, data, srt, spout, syphon
    publisher_id: str
    protocol: str  # tcp, udp, ndi, srt, webrtc, spout, syphon, shared_memory
    address: str
    port: int
    entity_id: Optional[str] = None
    device_id: Optional[str] = None
    config: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamRequestParams:
    """Parameters for requesting to consume a stream"""
    consumer_id: str
    consumer_address: str
    consumer_port: Optional[int] = None
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamOffer:
    """Publisher's response to a stream request"""
    session_id: str
    stream_id: str
    stream_name: str
    stream_type: str
    protocol: str
    publisher_address: str
    publisher_port: int
    transport_config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamSessionData:
    """Active streaming session"""
    session_id: str
    stream_id: str
    stream_name: str
    stream_type: str
    publisher_id: str
    publisher_address: str
    consumer_id: str
    consumer_address: str
    protocol: str
    transport_config: Dict[str, Any] = field(default_factory=dict)
    started_at: Optional[datetime] = None
    status: str = "active"


@dataclass
class StreamSessionHistoryData:
    """Historical session record"""
    time: datetime
    session_id: str
    stream_id: str
    stream_name: str
    stream_type: str
    publisher_id: str
    consumer_id: str
    protocol: str
    status: str
    duration_seconds: Optional[float] = None
    bytes_transferred: int = 0
    error_message: Optional[str] = None


@dataclass
class StreamRegistryStateData:
    """Full registry state"""
    streams: List[StreamData] = field(default_factory=list)
    sessions: List[StreamSessionData] = field(default_factory=list)
    stream_types: List[StreamTypeData] = field(default_factory=list)


StreamEventCallback = Callable[[StreamData], None]
SessionEventCallback = Callable[[StreamSessionData], None]
