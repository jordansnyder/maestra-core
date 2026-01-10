"""
Maestra Python SDK
Connect to the Maestra immersive experience platform
"""

from .client import MaestraClient
from .entity import Entity, EntityState
from .types import (
    EntityType,
    EntityData,
    StateChangeEvent,
    ConnectionConfig,
)

__version__ = "0.1.0"
__all__ = [
    "MaestraClient",
    "Entity",
    "EntityState",
    "EntityType",
    "EntityData",
    "StateChangeEvent",
    "ConnectionConfig",
]
