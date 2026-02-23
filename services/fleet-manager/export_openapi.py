"""Export the Fleet Manager OpenAPI spec as JSON without starting the server.

Usage: python export_openapi.py > openapi.json

Stubs out database/messaging dependencies so the FastAPI app object
can be imported and its OpenAPI schema extracted in a pure-Python
environment (no Postgres, NATS, Redis, or MQTT required).
"""

import json
import sys
import types


def _make_stub_class(cls_name, fields):
    """Create a stub class with attribute placeholders."""
    return type(cls_name, (), {f: None for f in fields} | {"__tablename__": cls_name.lower()})


# ---------------------------------------------------------------------------
# Stub external services before importing main.py.
# ---------------------------------------------------------------------------

# database.py — stub all ORM models and helpers
db_mod = types.ModuleType("database")
db_mod.get_db = lambda: None
db_mod.init_db = None
db_mod.close_db = None
db_mod.async_session_maker = None
db_mod.DeviceDB = _make_stub_class("DeviceDB", [
    "id", "name", "device_type", "hardware_id", "firmware_version",
    "ip_address", "location", "device_metadata", "status",
    "last_seen", "created_at", "updated_at"])
db_mod.EntityDB = _make_stub_class("EntityDB", [
    "id", "name", "slug", "entity_type_id", "parent_id", "path",
    "status", "state", "entity_metadata", "created_at", "updated_at"])
db_mod.EntityTypeDB = _make_stub_class("EntityTypeDB", [
    "id", "name", "display_name", "icon", "default_state",
    "variable_schema", "created_at", "updated_at"])
db_mod.RoutingDeviceDB = _make_stub_class("RoutingDeviceDB", [
    "id", "name", "device_type", "icon", "color", "inputs", "outputs",
    "routing_metadata", "position_x", "position_y", "sort_order",
    "created_at", "updated_at"])
db_mod.RouteDB = _make_stub_class("RouteDB", [
    "id", "source_device_id", "source_output", "target_device_id",
    "target_input", "route_metadata", "active", "created_at", "updated_at"])
db_mod.RoutePresetDB = _make_stub_class("RoutePresetDB", [
    "id", "name", "description", "routes", "created_at", "updated_at"])
db_mod.StreamTypeDB = _make_stub_class("StreamTypeDB", [
    "id", "name", "display_name", "description", "icon",
    "default_config", "stream_type_metadata", "created_at", "updated_at"])
sys.modules["database"] = db_mod

# state_manager.py
sm_mod = types.ModuleType("state_manager")
sm_mod.state_manager = type("SM", (), {
    "is_connected": False, "nc": None,
    "connect": lambda s: None, "disconnect": lambda s: None,
})()
sys.modules["state_manager"] = sm_mod

# stream_manager.py
stm_mod = types.ModuleType("stream_manager")
stm_mod.stream_manager = type("STM", (), {
    "connect": lambda s, *a: None, "disconnect": lambda s: None,
})()
sys.modules["stream_manager"] = stm_mod

# redis_client.py
rc_mod = types.ModuleType("redis_client")
rc_mod.init_redis = None
rc_mod.close_redis = None
rc_mod.get_redis = lambda: None
sys.modules["redis_client"] = rc_mod

# ---------------------------------------------------------------------------
# Import the app and dump the spec.
# ---------------------------------------------------------------------------
sys.path.insert(0, ".")
from main import app  # noqa: E402

spec = app.openapi()
json.dump(spec, sys.stdout, indent=2)
