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


# Enable forward references
Entity.model_rebuild()
EntityTreeNode.model_rebuild()
