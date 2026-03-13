"""
API-based DMX configuration loader.

Replaces the YAML patch_loader. Fetches Art-Net nodes and DMX fixtures
from the Fleet Manager REST API, resolves entity paths for fixtures
that have entity_id set, and returns a structured DMXConfig.
"""

import logging
from typing import Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class ChannelMapping(BaseModel):
    offset: int
    type: str
    enum_dmx_values: Optional[dict[str, int]] = None


class APIFixture(BaseModel):
    id: str
    name: str
    label: Optional[str] = None
    node_id: str
    universe: int
    start_channel: int
    channel_count: int = 1
    channel_map: dict[str, ChannelMapping] = {}
    entity_id: Optional[str] = None
    entity_path: Optional[str] = None  # resolved after fetch via /entities/{id}


class APINode(BaseModel):
    id: str
    name: str
    ip_address: str
    artnet_port: int = 6454
    universes: list[dict] = []

    def artnet_universe_for(self, maestra_universe: int) -> int:
        """Map a Maestra universe ID to an Art-Net universe number."""
        for u in self.universes:
            if u.get('id') == maestra_universe:
                return int(u.get('artnet_universe', maestra_universe - 1))
        return maestra_universe - 1  # fallback: zero-indexed


# ─── Config Container ─────────────────────────────────────────────────────────

class DMXConfig:
    """Loaded DMX configuration from the Fleet Manager API."""

    def __init__(self, nodes: list[APINode], fixtures: list[APIFixture]):
        self.nodes = nodes
        self.fixtures = fixtures
        self.node_by_id: dict[str, APINode] = {n.id: n for n in nodes}

    def is_empty(self) -> bool:
        return len(self.nodes) == 0 or len(self.fixtures) == 0

    def node_count(self) -> int:
        return len(self.nodes)

    def fixture_count(self) -> int:
        return len(self.fixtures)

    def routable_fixtures(self) -> list[APIFixture]:
        """Fixtures that have a resolved entity path (can receive NATS state)."""
        return [f for f in self.fixtures if f.entity_path]


# ─── Loader ───────────────────────────────────────────────────────────────────

async def load_from_api(fleet_manager_url: str, timeout: float = 10.0) -> DMXConfig:
    """
    Load DMX configuration from the Fleet Manager API.

    Fetches /dmx/nodes and /dmx/fixtures, then resolves entity paths
    for fixtures that have entity_id set.
    """
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.get(f'{fleet_manager_url}/dmx/nodes')
            resp.raise_for_status()
            nodes = [APINode(**n) for n in resp.json()]
        except Exception as e:
            logger.error(f"Failed to fetch DMX nodes from {fleet_manager_url}: {e}")
            raise

        try:
            resp = await client.get(f'{fleet_manager_url}/dmx/fixtures')
            resp.raise_for_status()
            fixtures = [APIFixture(**f) for f in resp.json()]
        except Exception as e:
            logger.error(f"Failed to fetch DMX fixtures from {fleet_manager_url}: {e}")
            raise

    # Resolve entity paths for fixtures that reference an entity
    entity_ids = list({f.entity_id for f in fixtures if f.entity_id})
    if entity_ids:
        entity_paths = await _resolve_entity_paths(fleet_manager_url, entity_ids, timeout)
        for fixture in fixtures:
            if fixture.entity_id and fixture.entity_id in entity_paths:
                fixture.entity_path = entity_paths[fixture.entity_id]

    config = DMXConfig(nodes=nodes, fixtures=fixtures)
    routable = len(config.routable_fixtures())
    logger.info(
        f"DMX config loaded: {config.node_count()} node(s), "
        f"{config.fixture_count()} fixture(s), {routable} with entity routing"
    )
    for fixture in config.routable_fixtures():
        node = config.node_by_id.get(fixture.node_id)
        logger.info(
            f"  '{fixture.name}' → {fixture.entity_path} "
            f"node={node.ip_address if node else '?'} "
            f"universe={fixture.universe} start_ch={fixture.start_channel} "
            f"channels={len(fixture.channel_map)}"
        )
    return config


async def _resolve_entity_paths(
    fleet_manager_url: str,
    entity_ids: list[str],
    timeout: float,
) -> dict[str, str]:
    """Fetch entity path for each entity ID."""
    paths: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=timeout) as client:
        for entity_id in entity_ids:
            try:
                resp = await client.get(f'{fleet_manager_url}/entities/{entity_id}')
                if resp.status_code == 200:
                    entity = resp.json()
                    path = entity.get('path') or entity.get('slug', '')
                    if path:
                        paths[entity_id] = path
            except Exception as e:
                logger.warning(f"Failed to resolve entity path for {entity_id}: {e}")
    return paths
