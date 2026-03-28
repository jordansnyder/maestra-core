"""
Maestra OSC Gateway
Bridges OSC messages (from TouchDesigner, Max/MSP, etc.) to NATS.
Supports entity state updates via reserved OSC addresses and configurable mappings.
"""

import asyncio
import os
import json
import re
from datetime import datetime
from pythonosc import dispatcher, osc_server, udp_client
from pythonosc.osc_server import AsyncIOOSCUDPServer
import nats
from nats.aio.client import Client as NATS
import aiohttp

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OSC_IN_PORT = int(os.getenv('OSC_IN_PORT', 57120))
OSC_OUT_PORT = int(os.getenv('OSC_OUT_PORT', 57121))
NATS_URL = os.getenv('NATS_URL', 'nats://nats:4222')
OSC_TARGETS = os.getenv('OSC_TARGETS', '')  # comma-separated ip:port
MAPPINGS_PATH = os.getenv('OSC_MAPPINGS_PATH', '/app/mappings.json')
FLEET_MANAGER_URL = os.getenv('FLEET_MANAGER_URL', 'http://fleet-manager:8080')

# Globals
nc: NATS = None
osc_client = None
osc_target_clients: list = []   # SimpleUDPClient per OSC_TARGETS entry
osc_mappings: dict = {}         # OSC address -> mapping config

# Valid slug characters for NATS subjects
_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


# ---------------------------------------------------------------------------
# OSC address mappings (for fixed-address installations)
# ---------------------------------------------------------------------------

async def fetch_mappings_from_api():
    """Fetch OSC address mappings from the Fleet Manager API.

    On success, replaces the global ``osc_mappings`` dict and returns True.
    On failure, logs a warning and returns False without clearing existing
    mappings so the gateway can continue operating with stale data.
    """
    global osc_mappings
    url = f"{FLEET_MANAGER_URL}/osc-mappings/?enabled=true"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    print(f"⚠️  Fleet Manager returned {resp.status} for OSC mappings")
                    return False
                entries = await resp.json()
                osc_mappings = {e['osc_address']: e for e in entries}
                print(f"📋 Loaded {len(osc_mappings)} OSC mapping(s) from Fleet Manager API")
                return True
    except Exception as e:
        print(f"⚠️  Failed to fetch OSC mappings from API: {e}")
        return False


async def reload_handler(msg):
    """Handle a hot-reload signal on maestra.config.osc.reload."""
    print("🔄 Received OSC mappings reload signal")
    await fetch_mappings_from_api()


def _load_mappings_from_file():
    """Load OSC-to-entity address mappings from the local JSON config file."""
    global osc_mappings

    if not os.path.exists(MAPPINGS_PATH):
        print(f"📋 No OSC mappings file at {MAPPINGS_PATH} (optional)")
        return

    try:
        with open(MAPPINGS_PATH) as f:
            entries = json.load(f)
        osc_mappings = {}
        for entry in entries:
            addr = entry.get('osc_address')
            if addr:
                osc_mappings[addr] = entry
        print(f"📋 Loaded {len(osc_mappings)} OSC address mapping(s) from file")
    except Exception as e:
        print(f"⚠️  Error loading OSC mappings from file: {e}")


async def load_osc_mappings():
    """Load OSC address mappings, preferring the Fleet Manager API.

    Attempts to fetch from the API with exponential back-off (3 attempts,
    2s / 4s / 8s delays). Falls back to the local JSON file only if every
    API attempt fails.
    """
    delays = [2, 4, 8]
    for attempt, delay in enumerate(delays, start=1):
        print(f"📋 Fetching OSC mappings from API (attempt {attempt}/{len(delays)})…")
        success = await fetch_mappings_from_api()
        if success:
            return
        if attempt < len(delays):
            print(f"   Retrying in {delay}s…")
            await asyncio.sleep(delay)

    print("📋 All API attempts failed — falling back to local mappings file")
    _load_mappings_from_file()


# ---------------------------------------------------------------------------
# Entity state helpers
# ---------------------------------------------------------------------------

def expand_key_path(segments: list, value) -> dict:
    """
    Build a nested dict from key path segments.
    expand_key_path(["color", "r"], 255) -> {"color": {"r": 255}}
    """
    result = {}
    current = result
    for seg in segments[:-1]:
        current[seg] = {}
        current = current[seg]
    current[segments[-1]] = value
    return result


def build_entity_state_from_reserved(parts: list, args: list):
    """
    Detect entity state intent from a reserved OSC address and build the
    NATS payload.  Returns (operation, slug, payload) or None.

    Reserved prefixes:
      /entity/update/<slug>[/<key>...]
      /entity/set/<slug>[/<key>...]

    Three input formats:
      A) Single-key shorthand: address has 4+ segments, key in address
      B) Key-value pairs:      address has 3 segments, args are k v k v ...
      C) JSON blob:            address has 3 segments, single JSON-string arg
    """
    # parts[0] is always '' (leading slash), so /entity/update/slug = ['', 'entity', 'update', 'slug']
    if len(parts) < 4 or parts[1] != 'entity' or parts[2] not in ('update', 'set'):
        return None

    operation = parts[2]
    slug = parts[3]

    if not _SLUG_RE.match(slug):
        print(f"⚠️  Invalid entity slug in OSC address: {slug}")
        return None

    # Format A: single-key shorthand  /entity/update/<slug>/<key>[/<subkey>...]
    if len(parts) >= 5:
        key_segments = parts[4:]
        # Multiple args → value is an array, single arg → bare value
        value = list(args) if len(args) != 1 else args[0]
        state = expand_key_path(key_segments, value)
        return operation, slug, {"state": state, "source": "osc"}

    # 3-segment address: /entity/update/<slug>  — determine B or C from args
    if len(args) == 1 and isinstance(args[0], str):
        # Format C: JSON blob
        try:
            parsed = json.loads(args[0])
            if isinstance(parsed, dict):
                return operation, slug, {"state": parsed, "source": "osc"}
        except (json.JSONDecodeError, ValueError):
            pass

    # Format B: key-value pairs
    if len(args) >= 2 and len(args) % 2 == 0 and isinstance(args[0], str):
        state = {}
        for i in range(0, len(args), 2):
            key = args[i]
            if not isinstance(key, str):
                break
            state[key] = args[i + 1]
        if state:
            return operation, slug, {"state": state, "source": "osc"}

    print(f"⚠️  Entity OSC address recognized but args format unrecognized: {args}")
    return None


def build_entity_state_from_mapping(address: str, args: list):
    """
    Check if the address matches a configured mapping and build the
    NATS payload.  Returns (operation, slug, payload) or None.
    """
    mapping = osc_mappings.get(address)
    if not mapping:
        return None

    slug = mapping.get('entity_slug')
    operation = mapping.get('operation', 'update')
    if not slug:
        return None

    # state_keys: positional args → named keys
    state_keys = mapping.get('state_keys')
    if state_keys:
        state = {}
        for i, key in enumerate(state_keys):
            if i < len(args):
                state[key] = args[i]
        if state:
            return operation, slug, {"state": state, "source": "osc"}
        return None

    # state_key: single arg → single key
    state_key = mapping.get('state_key')
    if state_key and len(args) >= 1:
        value = args[0] if len(args) == 1 else list(args)
        return operation, slug, {"state": {state_key: value}, "source": "osc"}

    return None


def osc_safe_value(value):
    """Convert a Python value to an OSC-safe type."""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float, str)):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if value is None:
        return 0
    return str(value)


# ---------------------------------------------------------------------------
# Inbound: OSC → NATS
# ---------------------------------------------------------------------------

async def _osc_handler_async(address: str, *args):
    """
    Async implementation of the OSC handler.

    1. Check for reserved entity state addresses (/entity/update/... or /entity/set/...)
    2. Check for configured address mappings
    3. Always publish to maestra.osc.* for backward compatibility
    """
    print(f"📨 OSC received: {address} {args}")

    if nc is None:
        print("⚠️  NATS not connected, skipping message")
        return

    # --- Entity state: reserved address ---
    parts = address.split('/')
    entity_result = build_entity_state_from_reserved(parts, list(args))
    if entity_result:
        operation, slug, payload = entity_result
        entity_subject = f"maestra.entity.state.{operation}.{slug}"
        try:
            await nc.publish(entity_subject, json.dumps(payload).encode())
            print(f"✅ Entity state {operation} → {entity_subject}")
        except Exception as e:
            print(f"❌ Error publishing entity state: {e}")

    # --- Entity state: address mapping ---
    if not entity_result and osc_mappings:
        mapping_result = build_entity_state_from_mapping(address, list(args))
        if mapping_result:
            operation, slug, payload = mapping_result
            entity_subject = f"maestra.entity.state.{operation}.{slug}"
            try:
                await nc.publish(entity_subject, json.dumps(payload).encode())
                print(f"✅ Mapped entity state {operation} → {entity_subject}")
            except Exception as e:
                print(f"❌ Error publishing mapped entity state: {e}")

    # --- Always publish to maestra.osc.* (existing behavior) ---
    message = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "osc",
        "address": address,
        "values": list(args)
    }
    nats_subject = f"maestra.osc{address.replace('/', '.')}"

    try:
        await nc.publish(nats_subject, json.dumps(message).encode())
        print(f"✅ Published to NATS: {nats_subject}")
    except Exception as e:
        print(f"❌ Error publishing to NATS: {e}")


def osc_handler(address: str, *args):
    """
    Sync wrapper for the OSC dispatcher callback.
    pythonosc calls handlers synchronously, so we schedule the async work
    on the running event loop.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_osc_handler_async(address, *args))
    except Exception as e:
        print(f"❌ Error scheduling OSC handler: {e}")


# ---------------------------------------------------------------------------
# Outbound: NATS → OSC
# ---------------------------------------------------------------------------

async def nats_to_osc_handler(msg):
    """
    Handle NATS messages on maestra.to_osc.* and forward to OSC.
    (Existing behavior, unchanged.)
    """
    subject = msg.subject
    data = json.loads(msg.data.decode())

    print(f"📨 NATS received: {subject}")

    osc_address = data.get('address', '/')
    osc_values = data.get('values', [])
    osc_target = data.get('target', '127.0.0.1')

    if osc_client:
        try:
            osc_client.send_message(osc_address, osc_values)
            print(f"✅ Sent OSC to {osc_target}: {osc_address} {osc_values}")
        except Exception as e:
            print(f"❌ Error sending OSC: {e}")


async def entity_state_to_osc_handler(msg):
    """
    Handle entity state broadcasts (maestra.entity.state.>) and send as OSC
    to all configured OSC_TARGETS.
    """
    if not osc_target_clients:
        return

    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, ValueError):
        return

    # Loop prevention: don't echo OSC-originated state changes back out
    if data.get('source') == 'osc':
        return

    entity_type = data.get('entity_type', 'unknown')
    slug = data.get('entity_slug', 'unknown')
    current_state = data.get('current_state', {})
    changed_keys = data.get('changed_keys', [])

    # Send per-changed-key messages
    for key in changed_keys:
        if key in current_state:
            value = osc_safe_value(current_state[key])
            osc_address = f"/entity/state/{entity_type}/{slug}/{key}"
            for client in osc_target_clients:
                try:
                    client.send_message(osc_address, [value])
                except Exception as e:
                    print(f"❌ Error sending OSC state key: {e}")

    # Send full-state message
    full_address = f"/entity/state/{entity_type}/{slug}"
    full_payload = json.dumps(current_state)
    for client in osc_target_clients:
        try:
            client.send_message(full_address, [full_payload])
        except Exception as e:
            print(f"❌ Error sending OSC full state: {e}")


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

async def connect_nats():
    """Connect to NATS message bus"""
    global nc
    nc = await nats.connect(NATS_URL)
    print(f"✅ Connected to NATS at {NATS_URL}")


async def init_osc_server():
    """Initialize OSC server to receive messages"""
    disp = dispatcher.Dispatcher()
    disp.set_default_handler(osc_handler)

    server = AsyncIOOSCUDPServer(
        ("0.0.0.0", OSC_IN_PORT),
        disp,
        asyncio.get_event_loop()
    )

    transport, protocol = await server.create_serve_endpoint()
    print(f"🎛️  OSC Server listening on 0.0.0.0:{OSC_IN_PORT}")
    return transport


async def init_osc_client():
    """Initialize OSC client for sending messages (maestra.to_osc.*)"""
    global osc_client
    osc_client = udp_client.SimpleUDPClient("127.0.0.1", OSC_OUT_PORT)
    print(f"📡 OSC Client ready to send on port {OSC_OUT_PORT}")


def init_osc_targets():
    """Parse OSC_TARGETS env var and create UDP clients for entity state outbound."""
    global osc_target_clients
    osc_target_clients = []

    if not OSC_TARGETS.strip():
        return

    for entry in OSC_TARGETS.split(','):
        entry = entry.strip()
        if not entry:
            continue
        try:
            if ':' in entry:
                ip, port = entry.rsplit(':', 1)
                port = int(port)
            else:
                ip = entry
                port = OSC_OUT_PORT
            client = udp_client.SimpleUDPClient(ip, port)
            osc_target_clients.append(client)
            print(f"📡 OSC target added: {ip}:{port}")
        except Exception as e:
            print(f"⚠️  Invalid OSC target '{entry}': {e}")

    if osc_target_clients:
        print(f"📡 {len(osc_target_clients)} OSC target(s) configured for entity state broadcasts")


async def subscribe_nats_to_osc():
    """Subscribe to NATS topics and forward to OSC"""
    if not nc:
        return

    # Existing: explicit outbound via maestra.to_osc.*
    await nc.subscribe("maestra.to_osc.*", cb=nats_to_osc_handler)
    print("📡 Subscribed to NATS: maestra.to_osc.*")

    # Entity state broadcasts → OSC targets (only if targets are configured)
    if osc_target_clients:
        await nc.subscribe("maestra.entity.state.>", cb=entity_state_to_osc_handler)
        print("📡 Subscribed to NATS: maestra.entity.state.> (outbound to OSC targets)")


async def main():
    """Main gateway loop"""

    print("🚀 Starting Maestra OSC Gateway...")

    # Load optional address mappings (tries Fleet Manager API first, then file)
    await load_osc_mappings()

    # Parse outbound OSC targets
    init_osc_targets()

    # Connect to NATS
    await connect_nats()

    # Subscribe to hot-reload signal for OSC mappings
    await nc.subscribe("maestra.config.osc.reload", cb=reload_handler)
    print("📡 Subscribed to NATS: maestra.config.osc.reload (hot-reload)")

    # Initialize OSC client for maestra.to_osc.* outbound
    await init_osc_client()

    # Subscribe to NATS for outgoing OSC messages
    await subscribe_nats_to_osc()

    # Start OSC server
    transport = await init_osc_server()

    print("\n✅ OSC Gateway ready!")
    print(f"   Receiving OSC on UDP port {OSC_IN_PORT}")
    print(f"   Sending OSC on UDP port {OSC_OUT_PORT}")
    print(f"   Connected to NATS at {NATS_URL}")

    if osc_mappings:
        print(f"   {len(osc_mappings)} address mapping(s) loaded")

    if osc_target_clients:
        print(f"   {len(osc_target_clients)} outbound target(s) for entity state")

    print("\n📚 Entity State via OSC:")
    print("   /entity/update/<slug>/<key> <value>    → update entity state")
    print("   /entity/set/<slug>/<key> <value>        → replace entity state")
    print("   /entity/update/<slug> key val key val   → multi-key update")

    print("\n📚 Generic OSC:")
    print(f"   TouchDesigner: Send OSC to this gateway's IP on port {OSC_IN_PORT}")
    print(f"   Max/MSP: [udpsend] to this gateway's IP on port {OSC_IN_PORT}")

    # Keep running
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        print("\n👋 Shutting down OSC Gateway...")
    finally:
        transport.close()
        if nc:
            await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
