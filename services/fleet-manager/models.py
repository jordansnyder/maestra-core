"""
Pydantic models for Fleet Manager API
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum


# =============================================================================
# Entity Type Models
# =============================================================================

class EntityTypeBase(BaseModel):
    """Base entity type fields"""
    name: str = Field(..., min_length=1, max_length=100, description="Unique type identifier")
    display_name: str = Field(..., max_length=255, description="Human-readable name")
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50, description="Icon name for UI")
    state_schema: Optional[Dict[str, Any]] = Field(None, description="JSON Schema for state validation")
    default_state: Dict[str, Any] = Field(default_factory=dict, description="Default state for new entities")
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EntityTypeCreate(EntityTypeBase):
    """Model for creating entity types"""
    pass


class EntityTypeUpdate(BaseModel):
    """Model for updating entity types"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    state_schema: Optional[Dict[str, Any]] = None
    default_state: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class EntityType(EntityTypeBase):
    """Full entity type response model"""
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Entity Models
# =============================================================================

class EntityBase(BaseModel):
    """Base entity fields"""
    name: str = Field(..., min_length=1, max_length=255)
    entity_type_id: UUID
    parent_id: Optional[UUID] = Field(None, description="Parent entity ID for hierarchy")
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    device_id: Optional[UUID] = Field(None, description="Linked device ID")


class EntityCreate(EntityBase):
    """Model for creating entities"""
    slug: Optional[str] = Field(None, description="URL-safe identifier (auto-generated if not provided)")
    state: Dict[str, Any] = Field(default_factory=dict, description="Initial entity state")


class EntityUpdate(BaseModel):
    """Model for updating entity metadata (not state)"""
    name: Optional[str] = None
    parent_id: Optional[UUID] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    device_id: Optional[UUID] = None


class Entity(EntityBase):
    """Full entity response model"""
    id: UUID
    slug: str
    path: Optional[str] = None
    state: Dict[str, Any] = Field(default_factory=dict)
    state_updated_at: datetime
    status: str
    created_at: datetime
    updated_at: datetime
    # Relationships (populated on request)
    entity_type: Optional[EntityType] = None
    children: List["Entity"] = Field(default_factory=list)

    class Config:
        from_attributes = True


# =============================================================================
# State Models
# =============================================================================

class StateUpdate(BaseModel):
    """Partial state update - merges with existing state"""
    state: Dict[str, Any] = Field(..., description="State values to merge")
    source: Optional[str] = Field(None, description="Source identifier (SDK/device)")


class StateSet(BaseModel):
    """Complete state replacement"""
    state: Dict[str, Any] = Field(..., description="Complete new state")
    source: Optional[str] = Field(None, description="Source identifier (SDK/device)")


class StateResponse(BaseModel):
    """Response for state operations"""
    entity_id: UUID
    entity_slug: str
    state: Dict[str, Any]
    state_updated_at: datetime


# =============================================================================
# State Event Models
# =============================================================================

class EntityStateEvent(BaseModel):
    """Event emitted when entity state changes"""
    type: str = "state_changed"
    entity_id: UUID
    entity_slug: str
    entity_type: str
    path: Optional[str]
    previous_state: Dict[str, Any]
    current_state: Dict[str, Any]
    changed_keys: List[str]
    source: Optional[str]
    timestamp: datetime


class EntityLifecycleEvent(BaseModel):
    """Event emitted on entity create/update/delete"""
    type: str  # "entity_created", "entity_updated", "entity_deleted"
    entity_id: UUID
    entity_slug: str
    entity_type: str
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime


# =============================================================================
# Variable Definition Models
# =============================================================================

class VariableType(str, Enum):
    """Supported variable data types"""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    COLOR = "color"
    VECTOR2 = "vector2"
    VECTOR3 = "vector3"
    RANGE = "range"
    ENUM = "enum"
    OBJECT = "object"


class VariableDirection(str, Enum):
    """Variable direction - input or output"""
    INPUT = "input"
    OUTPUT = "output"


class VariableDefinition(BaseModel):
    """Single variable definition for entity I/O"""
    name: str = Field(..., min_length=1, max_length=100, description="Variable name (maps to state key)")
    type: VariableType = Field(..., description="Data type")
    direction: VariableDirection = Field(..., description="Input or output")
    description: Optional[str] = Field(None, max_length=500)
    defaultValue: Optional[Any] = Field(None, description="Default value")
    required: bool = Field(False, description="Whether this variable is required (inputs only)")
    config: Dict[str, Any] = Field(default_factory=dict, description="Type-specific configuration")

    class Config:
        use_enum_values = True


class VariableDefinitionCreate(BaseModel):
    """Model for creating a variable definition"""
    name: str = Field(..., min_length=1, max_length=100)
    type: VariableType
    direction: VariableDirection
    description: Optional[str] = None
    defaultValue: Optional[Any] = None
    required: bool = False
    config: Optional[Dict[str, Any]] = None

    class Config:
        use_enum_values = True


class VariableDefinitionUpdate(BaseModel):
    """Model for updating a variable definition"""
    type: Optional[VariableType] = None
    direction: Optional[VariableDirection] = None
    description: Optional[str] = None
    defaultValue: Optional[Any] = None
    required: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None

    class Config:
        use_enum_values = True


class EntityVariables(BaseModel):
    """Container for all entity variable definitions"""
    inputs: List[VariableDefinition] = Field(default_factory=list)
    outputs: List[VariableDefinition] = Field(default_factory=list)


class EntityVariablesResponse(BaseModel):
    """Response model for entity variables"""
    entity_id: UUID
    entity_slug: str
    variables: EntityVariables


class ValidationWarning(BaseModel):
    """Warning for state/variable mismatch"""
    variable_name: str
    expected_type: str
    actual_type: str
    message: str
    severity: Literal["warning", "info"] = "warning"


class StateValidationResult(BaseModel):
    """Result of validating state against variable definitions"""
    entity_id: UUID
    valid: bool
    warnings: List[ValidationWarning] = Field(default_factory=list)
    missing_required: List[str] = Field(default_factory=list)
    undefined_keys: List[str] = Field(default_factory=list)


# =============================================================================
# Device Models (from existing implementation)
# =============================================================================

class DeviceStatus:
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    MAINTENANCE = "maintenance"


class Device(BaseModel):
    """Device response model"""
    id: Optional[UUID] = Field(default_factory=uuid4)
    name: str
    device_type: str
    hardware_id: str
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: str = DeviceStatus.OFFLINE
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class DeviceRegistration(BaseModel):
    """Device registration request"""
    name: str
    device_type: str
    hardware_id: str
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class DeviceHeartbeat(BaseModel):
    """Device heartbeat request"""
    hardware_id: str
    status: str = DeviceStatus.ONLINE
    metadata: Optional[Dict[str, Any]] = None


class DeviceMetric(BaseModel):
    """Device metric data"""
    device_id: UUID
    metric_name: str
    metric_value: float
    unit: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None


class DeviceEvent(BaseModel):
    """Device event data"""
    device_id: UUID
    event_type: str
    severity: str = "info"
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


# =============================================================================
# Query/Filter Models
# =============================================================================

class EntityFilter(BaseModel):
    """Filter parameters for entity queries"""
    entity_type: Optional[str] = None
    parent_id: Optional[UUID] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    search: Optional[str] = None


class PaginationParams(BaseModel):
    """Pagination parameters"""
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


# =============================================================================
# Tree Models
# =============================================================================

class EntityTreeNode(BaseModel):
    """Entity with nested children for tree representation"""
    id: UUID
    name: str
    slug: str
    entity_type_id: UUID
    entity_type_name: Optional[str] = None
    status: str
    state: Dict[str, Any]
    children: List["EntityTreeNode"] = Field(default_factory=list)

    class Config:
        from_attributes = True


# =============================================================================
# Routing Device Models
# =============================================================================

class RoutingDeviceCreate(BaseModel):
    """Create a routing device"""
    name: str = Field(..., min_length=1, max_length=255)
    device_type: str = Field(..., min_length=1, max_length=100)
    icon: str = Field(default='📦', max_length=50)
    color: str = Field(default='#6C757D', max_length=20)
    inputs: List[str] = Field(default_factory=list, description="Input port names")
    outputs: List[str] = Field(default_factory=list, description="Output port names")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    position_x: float = Field(default=0, description="Node graph X position")
    position_y: float = Field(default=0, description="Node graph Y position")
    sort_order: int = Field(default=0)


class RoutingDeviceUpdate(BaseModel):
    """Update a routing device"""
    name: Optional[str] = None
    device_type: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    inputs: Optional[List[str]] = None
    outputs: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    sort_order: Optional[int] = None


class RoutingDevice(BaseModel):
    """Routing device response model"""
    id: UUID
    name: str
    device_type: str
    icon: str
    color: str
    inputs: List[str]
    outputs: List[str]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    position_x: float
    position_y: float
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Route Models
# =============================================================================

class RouteCreate(BaseModel):
    """Create a route between device ports"""
    from_device_id: UUID = Field(..., alias="from")
    from_port: str = Field(..., alias="fromPort")
    to_device_id: UUID = Field(..., alias="to")
    to_port: str = Field(..., alias="toPort")
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class Route(BaseModel):
    """Route response model"""
    id: UUID
    from_device_id: UUID = Field(..., serialization_alias="from")
    from_port: str = Field(..., serialization_alias="fromPort")
    to_device_id: UUID = Field(..., serialization_alias="to")
    to_port: str = Field(..., serialization_alias="toPort")
    preset_id: Optional[UUID] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


class RouteBulkUpdate(BaseModel):
    """Replace all active routes at once"""
    routes: List[RouteCreate]


# =============================================================================
# Route Preset Models
# =============================================================================

class RoutePresetCreate(BaseModel):
    """Create a route preset"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RoutePresetUpdate(BaseModel):
    """Update a route preset"""
    name: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class RoutePreset(BaseModel):
    """Route preset response model"""
    id: UUID
    name: str
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    route_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoutePresetDetail(RoutePreset):
    """Route preset with included routes"""
    routes: List[Route] = Field(default_factory=list)


# =============================================================================
# Routing State (full state response for frontend)
# =============================================================================

class RoutingState(BaseModel):
    """Complete routing state for the frontend"""
    devices: List[RoutingDevice]
    routes: List[Route]
    presets: List[RoutePreset]


# =============================================================================
# Stream Models
# =============================================================================

class StreamType(str, Enum):
    """Supported stream data types for creative workflows"""
    NDI = "ndi"
    AUDIO = "audio"
    VIDEO = "video"
    TEXTURE = "texture"
    SENSOR = "sensor"
    OSC = "osc"
    MIDI = "midi"
    DATA = "data"
    SRT = "srt"
    SPOUT = "spout"
    SYPHON = "syphon"


class StreamProtocol(str, Enum):
    """Transport protocols for data plane"""
    TCP = "tcp"
    UDP = "udp"
    NDI = "ndi"
    SRT = "srt"
    WEBRTC = "webrtc"
    SPOUT = "spout"
    SYPHON = "syphon"
    SHARED_MEMORY = "shared_memory"


class StreamAdvertise(BaseModel):
    """Request model for advertising a new stream"""
    name: str = Field(..., min_length=1, max_length=255)
    stream_type: StreamType
    publisher_id: str = Field(..., min_length=1, description="Unique ID of the publishing device/client")
    protocol: StreamProtocol
    address: str = Field(..., min_length=1, description="Publisher IP address or hostname")
    port: int = Field(..., ge=0, le=65535)
    entity_id: Optional[UUID] = None
    device_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class StreamInfo(BaseModel):
    """Full stream information returned from the registry"""
    id: UUID
    name: str
    stream_type: str
    publisher_id: str
    protocol: str
    address: str
    port: int
    entity_id: Optional[UUID] = None
    device_id: Optional[UUID] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    advertised_at: datetime
    last_heartbeat: datetime
    active_sessions: int = 0


class StreamRequest(BaseModel):
    """Request model for consuming a stream"""
    consumer_id: str = Field(..., min_length=1, description="Unique ID of the consuming device/client")
    consumer_address: str = Field(..., min_length=1, description="Consumer IP address")
    consumer_port: Optional[int] = Field(None, ge=0, le=65535, description="Preferred port (0 for any)")
    config: Dict[str, Any] = Field(default_factory=dict, description="Consumer preferences")


class StreamOffer(BaseModel):
    """Publisher's response to a stream request with connection details"""
    session_id: UUID
    stream_id: UUID
    stream_name: str
    stream_type: str
    protocol: str
    publisher_address: str
    publisher_port: int
    transport_config: Dict[str, Any] = Field(default_factory=dict)


class StreamSession(BaseModel):
    """Active streaming session"""
    session_id: UUID
    stream_id: UUID
    stream_name: str
    stream_type: str
    publisher_id: str
    publisher_address: str
    consumer_id: str
    consumer_address: str
    protocol: str
    transport_config: Dict[str, Any] = Field(default_factory=dict)
    started_at: datetime
    status: str = "active"


class StreamSessionHistory(BaseModel):
    """Historical session record from Postgres"""
    time: datetime
    session_id: UUID
    stream_id: UUID
    stream_name: str
    stream_type: str
    publisher_id: str
    consumer_id: str
    protocol: str
    status: str
    duration_seconds: Optional[float] = None
    bytes_transferred: int = 0
    error_message: Optional[str] = None


class StreamTypeInfo(BaseModel):
    """Stream type definition"""
    id: UUID
    name: str
    display_name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    default_config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StreamTypeCreate(BaseModel):
    """Create a custom stream type"""
    name: str = Field(..., min_length=1, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    icon: Optional[str] = None
    default_config: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StreamRegistryState(BaseModel):
    """Full state response for dashboard"""
    streams: List[StreamInfo]
    sessions: List[StreamSession]
    stream_types: List[StreamTypeInfo]


# Enable forward references
Entity.model_rebuild()
EntityTreeNode.model_rebuild()
RoutePresetDetail.model_rebuild()
