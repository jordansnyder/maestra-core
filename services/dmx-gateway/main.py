"""
Maestra DMX / Art-Net Gateway

Bridges the NATS message bus to physical DMX lighting fixtures via the
Art-Net protocol. Follows the identical async pattern used by the OSC
gateway and MQTT-NATS bridge.

Supported NATS subjects:
  IN  maestra.entity.state.>          Entity state changes (patch-map mode)
  IN  maestra.to_artnet.universe.*    Raw 512-channel universe array (bypass mode)
  OUT maestra.artnet.universe.{n}     Art-Net feedback received from node
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
from patch_loader import PatchMap, load_patch
from universe_buffer import UniverseBufferSet

# ─── Configuration ────────────────────────────────────────────────────────────

NATS_URL = os.getenv('NATS_URL', 'nats://nats:4222')
PATCH_MAP_PATH = os.getenv('PATCH_MAP_PATH', '/config/patch.yaml')
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger('dmx-gateway')

# ─── Globals ──────────────────────────────────────────────────────────────────

nc: NATS = None
patch: PatchMap = None
mapper: ChannelMapper = None
sender: ArtNetSender = None
buffers: UniverseBufferSet = None


# ─── NATS Message Handlers ────────────────────────────────────────────────────

async def on_entity_state(msg):
    """
    Handle entity state change messages from any Maestra client.

    Expects:
      {
        "entity_path": "venue.stage.par_l1",
        "state": {"intensity": 0.8, "red": 1.0, "green": 0.0, "blue": 0.0}
      }
    """
    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Failed to decode entity state message: {e}")
        return

    entity_path = data.get('entity_path') or data.get('path')
    state = data.get('state', {})

    if not entity_path or not state:
        return

    updates = mapper.resolve(entity_path, state)
    if not updates:
        return  # entity not in patch map

    for universe_id, channel_updates in updates.items():
        buffers.apply(universe_id, channel_updates)
        sender.send(universe_id, buffers.get(universe_id))

    # Publish debug message with resolved channel values
    await _publish_fixture_debug(entity_path, updates)


async def on_raw_universe(msg):
    """
    Handle raw universe bypass messages.

    Expects:
      { "channels": [0, 255, 128, ...] }  (up to 512 values)

    Subject format: maestra.to_artnet.universe.{n}
    """
    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Failed to decode raw universe message: {e}")
        return

    try:
        universe_id = int(msg.subject.split('.')[-1])
    except (ValueError, IndexError):
        logger.warning(f"Could not parse universe id from subject: {msg.subject}")
        return

    channels = data.get('channels', [])
    if not isinstance(channels, list):
        logger.warning(f"Raw universe message 'channels' must be a list")
        return

    buffers.set(universe_id, channels)
    sender.send(universe_id, buffers.get(universe_id))
    logger.debug(f"Raw universe {universe_id} sent via bypass mode")


async def _publish_fixture_debug(entity_path: str, updates: dict[int, dict[int, int]]) -> None:
    """Publish resolved DMX channel values to NATS for monitoring/debug."""
    if nc is None:
        return

    subject = f"maestra.dmx.fixture.{entity_path.replace('.', '_')}"
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entity_path": entity_path,
        "dmx_updates": {
            str(universe): channels
            for universe, channels in updates.items()
        }
    }
    try:
        await nc.publish(subject, json.dumps(payload).encode())
    except Exception as e:
        logger.error(f"Failed to publish fixture debug message: {e}")


# ─── Keep-Alive Loop ─────────────────────────────────────────────────────────

async def keepalive_loop(hz: float) -> None:
    """
    Send all known universe buffers at a fixed rate to keep the Art-Net node
    from timing out and going dark between state changes.
    """
    interval = 1.0 / hz
    logger.info(f"Keep-alive loop started at {hz} Hz (every {interval:.3f}s)")

    while True:
        await asyncio.sleep(interval)
        for universe_id in buffers.all_universe_ids():
            try:
                sender.send(universe_id, buffers.get(universe_id))
            except Exception as e:
                logger.error(f"Keep-alive send failed for universe {universe_id}: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    global nc, patch, mapper, sender, buffers

    logger.info("=" * 60)
    logger.info("Starting Maestra DMX / Art-Net Gateway")
    logger.info("=" * 60)

    # Load and validate patch map — exits with a clear error if invalid
    patch = load_patch(PATCH_MAP_PATH)

    # Initialize components
    mapper = ChannelMapper(patch)
    sender = ArtNetSender(
        node_ip=patch.node.ip,
        node_port=patch.node.port,
        universe_offset=patch.node.universe_offset,
    )
    buffers = UniverseBufferSet()

    # Pre-create universe buffers so keep-alive starts immediately
    for universe in patch.universes:
        buffers.get(universe.id)

    # Connect to NATS
    logger.info(f"Connecting to NATS at {NATS_URL}...")
    nc = await nats.connect(
        NATS_URL,
        reconnected_cb=_on_nats_reconnect,
        disconnected_cb=_on_nats_disconnect,
        error_cb=_on_nats_error,
    )
    logger.info(f"Connected to NATS at {NATS_URL}")

    # Subscribe to entity state changes and raw universe bypass
    await nc.subscribe('maestra.entity.state.>', cb=on_entity_state)
    logger.info("Subscribed to NATS: maestra.entity.state.>")

    await nc.subscribe('maestra.to_artnet.universe.*', cb=on_raw_universe)
    logger.info("Subscribed to NATS: maestra.to_artnet.universe.*")

    # Start keep-alive loop
    asyncio.create_task(keepalive_loop(hz=patch.node.keepalive_hz))

    logger.info("=" * 60)
    logger.info("DMX Gateway ready")
    logger.info(f"  Venue:     {patch.venue}")
    logger.info(f"  Art-Net:   {patch.node.ip}:{patch.node.port}")
    logger.info(f"  Universes: {patch.universe_ids()}")
    logger.info(f"  Fixtures:  {len(patch.fixtures)}")
    logger.info(f"  Keep-alive: {patch.node.keepalive_hz} Hz")
    logger.info("")
    logger.info("  Listening for entity state changes → DMX channel updates")
    logger.info("  Publish to maestra.to_artnet.universe.{n} for raw bypass")
    logger.info("=" * 60)

    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down DMX Gateway...")
    finally:
        if nc:
            await nc.close()
        if sender:
            sender.close()
        logger.info("DMX Gateway stopped")


async def _on_nats_reconnect(nc):
    logger.info("NATS reconnected — universe buffer state preserved, resuming sends")


async def _on_nats_disconnect(nc):
    logger.warning("NATS disconnected — keep-alive continues sending to Art-Net node")


async def _on_nats_error(e):
    logger.error(f"NATS error: {e}")


if __name__ == '__main__':
    asyncio.run(main())
