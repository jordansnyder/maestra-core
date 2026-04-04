"""
Maestra DMX / Art-Net Gateway

Bridges the NATS message bus to physical DMX lighting fixtures via the
Art-Net protocol. Configuration is loaded dynamically from the Fleet Manager
REST API — no YAML patch file required.

Supported NATS subjects:
  IN  maestra.entity.state.>          Entity state changes
  IN  maestra.to_artnet.universe.*    Raw 512-channel universe array (bypass)
  OUT maestra.dmx.fixture.{path}      Resolved channel values per fixture (debug)
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import nats
from nats.aio.client import Client as NATS

from artnet_sender import ArtNetSender
from channel_mapper import ChannelMapper
from api_loader import DMXConfig, load_from_api
from universe_buffer import UniverseBufferSet

# ─── Configuration ────────────────────────────────────────────────────────────

NATS_URL                = os.getenv('NATS_URL', 'nats://nats:4222')
FLEET_MANAGER_URL       = os.getenv('FLEET_MANAGER_URL', 'http://fleet-manager:8080')
LOG_LEVEL               = os.getenv('LOG_LEVEL', 'INFO').upper()
CONFIG_REFRESH_INTERVAL = float(os.getenv('CONFIG_REFRESH_INTERVAL', '30'))
KEEPALIVE_HZ            = float(os.getenv('KEEPALIVE_HZ', '4'))

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('dmx-gateway')

# ─── Globals ──────────────────────────────────────────────────────────────────

nc: NATS = None
config: DMXConfig = None
mapper: ChannelMapper = None
senders: dict[str, ArtNetSender] = {}       # node_id -> ArtNetSender
buffers: dict[str, UniverseBufferSet] = {}  # node_id -> UniverseBufferSet

# When True, only messages with source='dashboard-dmx' reach fixtures
_paused: bool = False

# Source tag that the Maestra Dashboard uses — always allowed through
DASHBOARD_SOURCE = 'dashboard-dmx'


# ─── Config Management ────────────────────────────────────────────────────────

async def fetch_config_with_retry() -> DMXConfig:
    """Load DMX config from Fleet Manager API, retrying until successful."""
    while True:
        try:
            return await load_from_api(FLEET_MANAGER_URL)
        except Exception as e:
            logger.warning(f"Config load failed ({e}), retrying in 10s...")
            await asyncio.sleep(10)


def rebuild_components(new_config: DMXConfig) -> None:
    """Rebuild senders, buffers, and mapper from updated config."""
    global config, mapper, senders, buffers

    config = new_config

    # Create one ArtNetSender per node; reuse existing if node already known
    old_senders = dict(senders)
    senders = {}
    for node in config.nodes:
        if node.id in old_senders:
            senders[node.id] = old_senders.pop(node.id)
        else:
            senders[node.id] = ArtNetSender(
                node_ip=node.ip_address,
                node_port=node.artnet_port,
            )

    # Close senders for nodes that no longer exist
    for s in old_senders.values():
        s.close()

    # Ensure buffers exist for each node
    for node in config.nodes:
        if node.id not in buffers:
            buffers[node.id] = UniverseBufferSet()

    # Pre-create universe buffers for all configured fixture universes
    # so the keep-alive loop starts sending black frames immediately
    for fixture in config.fixtures:
        node = config.node_by_id.get(fixture.node_id)
        if node and fixture.node_id in buffers:
            artnet_universe = node.artnet_universe_for(fixture.universe)
            buffers[fixture.node_id].get(artnet_universe)  # creates if missing

    mapper = ChannelMapper(config)


async def config_refresh_loop() -> None:
    """Periodically reload config from the API to pick up new fixtures."""
    while True:
        await asyncio.sleep(CONFIG_REFRESH_INTERVAL)
        try:
            new_config = await load_from_api(FLEET_MANAGER_URL)
            rebuild_components(new_config)
            logger.info("DMX config refreshed from API")
        except Exception as e:
            logger.warning(f"Config refresh failed: {e}")


# ─── NATS Message Handlers ────────────────────────────────────────────────────

async def on_dmx_control(msg):
    """Handle DMX pause/resume control messages from Fleet Manager."""
    global _paused
    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    action = data.get('action')
    if action == 'pause':
        _paused = True
        logger.info("DMX output PAUSED — only dashboard-dmx source will be forwarded")
    elif action == 'resume':
        _paused = False
        logger.info("DMX output RESUMED — all sources forwarded")


async def on_entity_state(msg):
    """Handle entity state change messages from any Maestra client."""
    global _paused
    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Failed to decode entity state message: {e}")
        return

    # When paused, only the dashboard's own adjustments pass through
    if _paused and data.get('source') != DASHBOARD_SOURCE:
        return

    # Fleet Manager publishes "path" (LTREE) + "entity_slug"; direct NATS clients
    # may use "entity_path". Fall back to slug so fixtures with null LTREE paths
    # (e.g. entities created before the trigger existed) still resolve.
    entity_path = data.get('entity_path') or data.get('path') or data.get('entity_slug')
    # Fleet Manager publishes 'current_state'; direct NATS clients use 'state'
    state = data.get('current_state') or data.get('state') or {}

    if not entity_path:
        logger.debug(
            "Skipping entity state message: no resolvable path "
            f"(slug={data.get('entity_slug')}, type={data.get('entity_type')})"
        )
        return

    if not state:
        logger.debug(f"Skipping entity state message: empty state for {entity_path}")
        return

    if mapper is None:
        logger.warning("ChannelMapper not initialised yet — dropping entity state update")
        return

    updates = mapper.resolve(entity_path, state)
    if not updates:
        # Only log at DEBUG — most state changes are for non-DMX entities
        logger.debug(
            f"No DMX channel updates for entity path '{entity_path}' "
            f"(keys={list(state.keys())}). "
            f"Known fixture paths: {mapper.fixture_paths()}"
        )
        return

    for node_id, universe_updates in updates.items():
        sender = senders.get(node_id)
        node_buffers = buffers.get(node_id)
        if not sender or not node_buffers:
            continue
        for artnet_universe, channel_updates in universe_updates.items():
            node_buffers.apply(artnet_universe, channel_updates)
            sender.send(artnet_universe, node_buffers.get(artnet_universe))

    await _publish_fixture_debug(entity_path, updates)


async def on_raw_universe(msg):
    """
    Handle raw universe bypass messages.
    Subject format: maestra.to_artnet.universe.{n}
    Sends the raw channel array to all configured nodes for that universe.
    """
    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Failed to decode raw universe message: {e}")
        return

    try:
        artnet_universe = int(msg.subject.split('.')[-1])
    except (ValueError, IndexError):
        logger.warning(f"Could not parse universe from subject: {msg.subject}")
        return

    channels = data.get('channels', [])
    if not isinstance(channels, list):
        return

    for node_id, sender in senders.items():
        node_buffers = buffers.get(node_id)
        if node_buffers:
            node_buffers.set(artnet_universe, channels)
            sender.send(artnet_universe, node_buffers.get(artnet_universe))

    logger.debug(f"Raw bypass: artnet_universe={artnet_universe} → {len(senders)} node(s)")


async def _publish_fixture_debug(entity_path: str, updates: dict) -> None:
    if nc is None:
        return
    subject = f"maestra.dmx.fixture.{entity_path.replace('.', '_')}"
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entity_path": entity_path,
        "dmx_updates": {
            node_id: {str(u): chs for u, chs in u_updates.items()}
            for node_id, u_updates in updates.items()
        },
    }
    try:
        await nc.publish(subject, json.dumps(payload).encode())
    except Exception as e:
        logger.error(f"Failed to publish fixture debug: {e}")


# ─── Keep-Alive Loop ─────────────────────────────────────────────────────────

_heartbeat_counter: int = 0

async def keepalive_loop(hz: float) -> None:
    """
    Send all universe buffers at a fixed rate to prevent Art-Net nodes
    from timing out between entity state changes.
    Publishes a NATS heartbeat for each active node every 10 seconds.
    """
    global _heartbeat_counter
    interval = 1.0 / hz
    heartbeat_every = max(1, int(10.0 / interval))  # every ~10s
    logger.info(f"Keep-alive loop at {hz} Hz (every {interval:.3f}s)")
    while True:
        await asyncio.sleep(interval)
        _heartbeat_counter += 1
        publish_heartbeat = (_heartbeat_counter % heartbeat_every == 0)
        for node_id, sender in senders.items():
            node_buffers = buffers.get(node_id)
            if not node_buffers:
                continue
            for universe_id in node_buffers.all_universe_ids():
                try:
                    sender.send(universe_id, node_buffers.get(universe_id))
                except Exception as e:
                    logger.error(
                        f"Keep-alive failed node={node_id} universe={universe_id}: {e}"
                    )
            if publish_heartbeat and nc:
                try:
                    payload = json.dumps({"node_id": node_id}).encode()
                    await nc.publish(f"maestra.dmx.node.heartbeat.{node_id}", payload)
                except Exception:
                    pass


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    global nc

    logger.info("=" * 60)
    logger.info("Starting Maestra DMX / Art-Net Gateway")
    logger.info(f"  Fleet Manager: {FLEET_MANAGER_URL}")
    logger.info("=" * 60)

    # Load initial config from API (with retry until Fleet Manager is ready)
    initial_config = await fetch_config_with_retry()
    rebuild_components(initial_config)

    if initial_config.is_empty():
        logger.warning(
            "No nodes or fixtures configured yet. "
            "Add nodes/fixtures via the dashboard; gateway will pick them up automatically."
        )

    # Connect to NATS
    logger.info(f"Connecting to NATS at {NATS_URL}...")
    nc = await nats.connect(
        NATS_URL,
        reconnected_cb=_on_nats_reconnect,
        disconnected_cb=_on_nats_disconnect,
        error_cb=_on_nats_error,
    )
    logger.info("Connected to NATS")

    await nc.subscribe('maestra.entity.state.>', cb=on_entity_state)
    await nc.subscribe('maestra.to_artnet.universe.*', cb=on_raw_universe)
    await nc.subscribe('maestra.dmx.control', cb=on_dmx_control)
    logger.info("Subscribed to NATS subjects")

    asyncio.create_task(keepalive_loop(hz=KEEPALIVE_HZ))
    asyncio.create_task(config_refresh_loop())

    logger.info("=" * 60)
    logger.info("DMX Gateway ready")
    logger.info(f"  Nodes:    {initial_config.node_count()}")
    logger.info(f"  Fixtures: {initial_config.fixture_count()}")
    logger.info(f"  Routable: {len(initial_config.routable_fixtures())}")
    logger.info(f"  Refresh:  every {CONFIG_REFRESH_INTERVAL}s")
    logger.info("=" * 60)

    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down DMX Gateway...")
    finally:
        if nc:
            await nc.close()
        for s in senders.values():
            s.close()
        logger.info("DMX Gateway stopped")


async def _on_nats_reconnect(nc):
    logger.info("NATS reconnected — resuming sends")


async def _on_nats_disconnect(nc):
    logger.warning("NATS disconnected — keep-alive continues")


async def _on_nats_error(e):
    logger.error(f"NATS error: {e}")


if __name__ == '__main__':
    asyncio.run(main())
