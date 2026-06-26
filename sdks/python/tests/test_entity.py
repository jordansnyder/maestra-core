"""Unit tests for the Maestra Python SDK entity + state logic.

These exercise the pure client-side behaviour (state container, subscriptions,
optimistic updates) without requiring a running Maestra instance — the HTTP
transport is replaced with a recording stub.
"""
from datetime import datetime

import pytest

from maestra.entity import Entity, EntityState
from maestra.types import EntityData, StateChangeEvent


def make_entity(state=None):
    """Build an Entity backed by a fake client that records HTTP calls."""
    calls = []

    class FakeHttp:
        async def update_state(self, entity_id, state, source):
            calls.append(("update", entity_id, state, source))

        async def set_state(self, entity_id, state, source):
            calls.append(("set", entity_id, state, source))

    class FakeClient:
        def __init__(self):
            self._http = FakeHttp()

    data = EntityData(
        id="ent-1",
        name="Main Light",
        slug="main-light",
        entity_type_id="type-1",
        entity_type_name="actuator",
        state=dict(state or {}),
        tags=["lighting"],
    )
    return Entity(FakeClient(), data), calls


def make_event(current, changed, previous=None):
    return StateChangeEvent(
        type="state_changed",
        entity_id="ent-1",
        entity_slug="main-light",
        entity_type="actuator",
        path=None,
        previous_state=previous or {},
        current_state=current,
        changed_keys=changed,
        source="test",
        timestamp=datetime(2026, 1, 1),
    )


def test_state_get_and_membership():
    s = EntityState(entity=None, initial_state={"brightness": 50})
    assert s.get("brightness") == 50
    assert s.get("missing", "fallback") == "fallback"
    assert s["brightness"] == 50
    assert "brightness" in s
    assert "color" not in s


def test_state_data_is_a_copy():
    s = EntityState(entity=None, initial_state={"brightness": 50})
    snapshot = s.data
    snapshot["brightness"] = 999
    assert s.get("brightness") == 50, "mutating .data must not affect internal state"


def test_apply_update_replaces_state_and_notifies():
    s = EntityState(entity=None, initial_state={"brightness": 10})
    seen = []
    unsub = s.on_change(lambda ev: seen.append(ev.current_state))

    s._apply_update(make_event({"brightness": 80, "color": "#fff"}, ["brightness", "color"]))

    assert s.get("brightness") == 80
    assert s.get("color") == "#fff"
    assert seen == [{"brightness": 80, "color": "#fff"}]

    unsub()
    s._apply_update(make_event({"brightness": 0}, ["brightness"]))
    assert len(seen) == 1, "callback must not fire after unsubscribe"


def test_callback_error_does_not_break_dispatch():
    s = EntityState(entity=None, initial_state={})
    good = []

    def boom(ev):
        raise RuntimeError("callback blew up")

    s.on_change(boom)
    s.on_change(lambda ev: good.append(True))
    # Should not raise even though the first callback throws.
    s._apply_update(make_event({"x": 1}, ["x"]))
    assert good == [True]


def test_entity_properties_and_to_dict():
    entity, _ = make_entity({"brightness": 25})
    assert entity.id == "ent-1"
    assert entity.slug == "main-light"
    assert entity.entity_type_name == "actuator"
    d = entity.to_dict()
    assert d["slug"] == "main-light"
    assert d["state"] == {"brightness": 25}
    assert d["tags"] == ["lighting"]


@pytest.mark.asyncio
async def test_update_merges_state_and_calls_http():
    entity, calls = make_entity({"brightness": 25})
    await entity.state.update({"color": "#ff0000"}, source="test")
    # Optimistic local merge keeps existing keys.
    assert entity.state.get("brightness") == 25
    assert entity.state.get("color") == "#ff0000"
    assert calls == [("update", "ent-1", {"color": "#ff0000"}, "test")]


@pytest.mark.asyncio
async def test_replace_overwrites_state_and_calls_http():
    entity, calls = make_entity({"brightness": 25, "color": "#fff"})
    await entity.state.replace({"brightness": 100}, source="test")
    assert entity.state.data == {"brightness": 100}, "replace must drop old keys"
    assert calls == [("set", "ent-1", {"brightness": 100}, "test")]


@pytest.mark.asyncio
async def test_set_single_value():
    entity, calls = make_entity({})
    await entity.state.set("brightness", 75)
    assert entity.state.get("brightness") == 75
    assert calls[0][0] == "update"
    assert calls[0][2] == {"brightness": 75}
