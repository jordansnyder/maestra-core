"""
Tests for StateManager performance fixes.

Verifies:
- Single NATS/MQTT publish per state change (not fan-out to multiple subjects)
- Entity cache hit avoids full JOIN query
- Entity cache invalidation on lifecycle events
- No previous_state leaked into broadcast events
- Single NATS publish for lifecycle events
"""

import json
import asyncio
import pytest
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from datetime import datetime

import sys
import os

# Add service root to path so we can import state_manager directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from state_manager import StateManager, EntityCacheEntry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sm():
    """Create a StateManager with mocked NATS and MQTT clients."""
    manager = StateManager(nats_url="nats://fake:4222", mqtt_broker="fake")

    # Mock NATS client
    manager.nc = AsyncMock()
    manager.nc.is_closed = False
    manager.nc.publish = AsyncMock()

    # Mock MQTT client
    manager.mqtt_client = MagicMock()
    manager.mqtt_client.publish = MagicMock()

    return manager


# ---------------------------------------------------------------------------
# 1. _publish_nats publishes to exactly 1 subject
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_publish_nats(sm):
    """_publish_nats should publish to exactly one NATS subject:
    maestra.entity.state.<type>.<slug>
    """
    event = {"type": "state_changed", "current_state": {"brightness": 100}}

    await sm._publish_nats("my-light", "light", event)

    sm.nc.publish.assert_called_once()
    call_args = sm.nc.publish.call_args
    subject = call_args[0][0]
    assert subject == "maestra.entity.state.light.my-light"

    # Verify payload is valid JSON containing the event
    payload = json.loads(call_args[0][1].decode())
    assert payload["type"] == "state_changed"


# ---------------------------------------------------------------------------
# 2. _publish_mqtt publishes to exactly 1 topic
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_publish_mqtt(sm):
    """_publish_mqtt should publish to exactly one MQTT topic:
    maestra/entity/state/<type>/<slug>
    """
    event = {"type": "state_changed", "current_state": {"brightness": 100}}

    await sm._publish_mqtt("my-light", "light", event)

    sm.mqtt_client.publish.assert_called_once()
    call_args = sm.mqtt_client.publish.call_args
    topic = call_args[0][0]
    assert topic == "maestra/entity/state/light/my-light"

    # Verify payload is valid JSON
    payload = json.loads(call_args[0][1])
    assert payload["type"] == "state_changed"


# ---------------------------------------------------------------------------
# 3. Entity cache hit skips the full JOIN query
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_entity_cache_hit(sm):
    """After the first lookup populates the cache, subsequent calls for the
    same slug should NOT execute the EntityDB+EntityTypeDB join query.
    The join (select(EntityDB, EntityTypeDB).join(...)) should only be
    called once across two updates.
    """
    entity_id = uuid4()
    entity_slug = "test-sensor"
    entity_type_name = "sensor"

    # Build a fake DB entity
    fake_entity = MagicMock()
    fake_entity.id = entity_id
    fake_entity.slug = entity_slug
    fake_entity.path = "building.floor1.sensor1"
    fake_entity.entity_metadata = None
    fake_entity.device_id = None
    fake_entity.state = {"temperature": 22}
    fake_entity.state_updated_at = None

    # Build a fake entity type
    fake_type = MagicMock()
    fake_type.name = entity_type_name

    # Mock the async session and queries
    mock_session = AsyncMock()

    # Track which queries are executed
    join_query_count = 0
    pk_query_count = 0

    async def fake_execute(query):
        nonlocal join_query_count, pk_query_count
        query_str = str(query)
        result = MagicMock()

        # Detect JOIN vs simple PK lookup by checking the compiled query
        # The join query uses .join() which produces a JOIN clause
        if "entity_types" in query_str or "JOIN" in query_str.upper():
            join_query_count += 1
            row = MagicMock()
            row.__getitem__ = lambda self, idx: [fake_entity, fake_type][idx]
            result.first.return_value = (fake_entity, fake_type)
        else:
            pk_query_count += 1
            result.scalar_one_or_none.return_value = fake_entity

        return result

    mock_session.execute = fake_execute
    mock_session.commit = AsyncMock()

    # Patch async_session_maker, EntityDB, EntityTypeDB, and record_state_change
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch.dict("sys.modules", {
        "database": MagicMock(
            async_session_maker=MagicMock(return_value=mock_cm),
            EntityDB=MagicMock(
                id=MagicMock(),
                slug=MagicMock(),
                entity_type_id=MagicMock(),
            ),
            EntityTypeDB=MagicMock(id=MagicMock()),
        ),
        "entity_router": MagicMock(
            record_state_change=AsyncMock(),
        ),
    }):
        with patch("sqlalchemy.select") as mock_select:
            # Make select() return something whose str() reveals the table
            def fake_select(*models):
                q = MagicMock()
                model_names = " ".join(getattr(m, "__name__", str(m)) for m in models)
                q.__str__ = lambda self: model_names
                q.join.return_value = q
                q.where.return_value = q
                return q

            mock_select.side_effect = fake_select

            # Suppress broadcast (already tested separately)
            sm.broadcast_state_change = AsyncMock()

            # First call: cache miss -> should do the JOIN query
            await sm._handle_mqtt_state_update(
                "update", entity_slug, {"state": {"temperature": 23}}
            )
            assert join_query_count == 1, "First call should do a JOIN query"

            # Second call: cache hit -> should NOT do the JOIN query
            await sm._handle_mqtt_state_update(
                "update", entity_slug, {"state": {"temperature": 24}}
            )
            assert join_query_count == 1, "Second call should NOT do another JOIN query"
            assert pk_query_count >= 1, "Cache hit should do a simple PK lookup"


# ---------------------------------------------------------------------------
# 4. Cache invalidation
# ---------------------------------------------------------------------------

def test_entity_cache_invalidation(sm):
    """invalidate_entity_cache(slug) removes the slug from _entity_cache,
    and broadcast_entity_lifecycle calls it.
    """
    slug = "my-entity"
    sm._entity_cache[slug] = EntityCacheEntry(
        entity_id=uuid4(),
        entity_type="light",
        entity_path="a.b.c",
        entity_metadata=None,
        device_id=None,
    )

    assert slug in sm._entity_cache
    sm.invalidate_entity_cache(slug)
    assert slug not in sm._entity_cache


@pytest.mark.asyncio
async def test_broadcast_entity_lifecycle_invalidates_cache(sm):
    """broadcast_entity_lifecycle should call invalidate_entity_cache."""
    slug = "my-entity"
    sm._entity_cache[slug] = EntityCacheEntry(
        entity_id=uuid4(),
        entity_type="light",
        entity_path="a.b.c",
        entity_metadata=None,
        device_id=None,
    )

    await sm.broadcast_entity_lifecycle(
        event_type="updated",
        entity_id=uuid4(),
        entity_slug=slug,
        entity_type="light",
        data={"name": "Updated Light"},
    )

    assert slug not in sm._entity_cache


# ---------------------------------------------------------------------------
# 5. No previous_state in broadcast event
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_previous_state_in_broadcast(sm):
    """The event dict passed to _publish_nats should NOT contain a
    'previous_state' key — only 'current_state'.
    """
    captured_events = []
    original_publish_nats = sm._publish_nats

    async def capture_publish_nats(slug, entity_type, event):
        captured_events.append(event)
        # Don't actually publish
        return

    sm._publish_nats = capture_publish_nats
    sm._publish_mqtt = AsyncMock()

    await sm.broadcast_state_change(
        entity_id=uuid4(),
        entity_slug="test-entity",
        entity_type="sensor",
        entity_path="building.sensor",
        previous_state={"temp": 20},
        new_state={"temp": 25},
        source="mqtt",
    )

    assert len(captured_events) == 1
    event = captured_events[0]
    assert event["previous_state"] == {}, (
        "Event should contain empty 'previous_state' for SDK compat"
    )
    assert "current_state" in event
    assert event["current_state"] == {"temp": 25}


# ---------------------------------------------------------------------------
# 6. _publish_nats_lifecycle publishes to exactly 1 subject
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_single_publish_nats_lifecycle(sm):
    """_publish_nats_lifecycle should publish to exactly one NATS subject:
    maestra.entity.<event_type>.<entity_type>.<slug>
    """
    event = {
        "type": "entity_created",
        "entity_id": str(uuid4()),
        "entity_slug": "new-light",
        "entity_type": "light",
    }

    await sm._publish_nats_lifecycle("created", "new-light", "light", event)

    sm.nc.publish.assert_called_once()
    call_args = sm.nc.publish.call_args
    subject = call_args[0][0]
    assert subject == "maestra.entity.created.light.new-light"
