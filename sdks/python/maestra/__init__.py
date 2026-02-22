"""
Maestra Python SDK
Connect to the Maestra immersive experience platform
"""

from .client import MaestraClient
from .entity import Entity, EntityState
from .stream import StreamPublisher, StreamConsumer
from .types import (
    EntityType,
    EntityData,
    StateChangeEvent,
    ConnectionConfig,
    StreamTypeData,
    StreamData,
    StreamAdvertiseParams,
    StreamRequestParams,
    StreamOffer,
    StreamSessionData,
    StreamSessionHistoryData,
    StreamRegistryStateData,
)

__version__ = "0.2.0"
__all__ = [
    "MaestraClient",
    "Entity",
    "EntityState",
    "EntityType",
    "EntityData",
    "StateChangeEvent",
    "ConnectionConfig",
    # Streams
    "StreamPublisher",
    "StreamConsumer",
    "StreamTypeData",
    "StreamData",
    "StreamAdvertiseParams",
    "StreamRequestParams",
    "StreamOffer",
    "StreamSessionData",
    "StreamSessionHistoryData",
    "StreamRegistryStateData",
]
