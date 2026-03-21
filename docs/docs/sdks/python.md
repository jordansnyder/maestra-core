# Python SDK

## Installation

```bash
pip install maestra
```

## Quick Start

```python
import asyncio
from maestra import MaestraClient

async def main():
    client = MaestraClient("http://localhost:8080")
    await client.connect()

    # Get entity
    entity = await client.get_entity("gallery-light-1")

    # Read state
    brightness = entity.state.get("brightness", 0)

    # Update state
    await entity.update_state({"brightness": 75})

    # Subscribe to changes
    entity.on_state_change(lambda state, keys: print(f"Changed: {keys}"))

asyncio.run(main())
```

## State Updates

The Python SDK updates state via the HTTP API by default. State changes are broadcast to all subscribers via NATS and MQTT automatically.

```python
# Partial update (merge)
await entity.update_state({"brightness": 75, "color": "#ff9900"})

# Full replacement
await entity.replace_state({"brightness": 100})

# Subscribe to real-time changes
entity.on_state_change(lambda state, keys: print(f"Changed: {keys}"))
```

You can also update state via MQTT directly (useful for lightweight scripts):

```python
import paho.mqtt.client as mqtt
import json

client = mqtt.Client()
client.connect("localhost", 1883)
client.publish(
    "maestra/entity/state/update/gallery-light-1",
    json.dumps({"state": {"brightness": 75}, "source": "python-script"})
)
```

## Streams

```python
from maestra import StreamPublisher, StreamAdvertiseParams

async def publish_stream():
    client = MaestraClient()
    await client.connect()

    publisher = StreamPublisher(client, StreamAdvertiseParams(
        name="Camera A",
        stream_type="ndi",
        publisher_id="td-01",
        protocol="ndi",
        address="192.168.1.50",
        port=5960,
    ))

    stream = await publisher.start()  # Advertise + auto-heartbeat
    # ... stream stays alive automatically ...
    await publisher.stop()             # Withdraw + stop heartbeat
```

See [Streams Guide](../guides/streams.md) for consumer examples and more.

See `sdks/python/README.md` for full documentation.
