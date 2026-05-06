"""
conftest.py — Pre-import mocks for fleet-manager unit tests.

Mocks out all external service dependencies (NATS, Redis, MQTT, asyncpg)
so tests run in a bare virtualenv with no live connections required.
Must be loaded by pytest before any test module imports service code.
"""
import sys
from unittest.mock import MagicMock, AsyncMock

# ── NATS ──────────────────────────────────────────────────────────────────────
nats_mock = MagicMock()
nats_mock.aio = MagicMock()
nats_mock.aio.client = MagicMock()
nats_mock.aio.client.Client = MagicMock
sys.modules["nats"] = nats_mock
sys.modules["nats.aio"] = nats_mock.aio
sys.modules["nats.aio.client"] = nats_mock.aio.client

# ── Redis ─────────────────────────────────────────────────────────────────────
redis_mock = MagicMock()
sys.modules["redis"] = redis_mock
sys.modules["redis.asyncio"] = MagicMock()

# ── Paho MQTT ─────────────────────────────────────────────────────────────────
paho_mock = MagicMock()
sys.modules["paho"] = paho_mock
sys.modules["paho.mqtt"] = MagicMock()
sys.modules["paho.mqtt.client"] = MagicMock()

# ── asyncpg (pulled in by SQLAlchemy async engine) ────────────────────────────
sys.modules["asyncpg"] = MagicMock()
