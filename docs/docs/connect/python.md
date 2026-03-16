# Python

Connect Python scripts, data pipelines, or automation tools to Maestra.

## What you need

- **Python 3.8+**
- **The Maestra server address** — ask your technical director or admin (e.g., `http://192.168.1.10:8080`)

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, the address is `http://localhost:8080`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Install the SDK

```bash
pip install maestra
```

## Step 2: Connect and read state

```python
import asyncio
from maestra import MaestraClient

async def main():
    client = MaestraClient("http://192.168.1.10:8080")  # Your Maestra address
    await client.connect()

    # Get an entity and read its state
    entity = await client.get_entity("gallery-light-1")
    brightness = entity.state.get("brightness", 0)
    print(f"Brightness is: {brightness}")

    # Listen for live updates from other devices
    entity.on_state_change(lambda state, keys: print(f"Changed: {keys}"))

asyncio.run(main())
```

## Step 3: Send updates

```python
# Update one or more values (merges with existing state)
await entity.update_state({"brightness": 75, "color": "#ff9900"})

# Replace the entire state
await entity.replace_state({"brightness": 100})
```

## Sharing streams

Advertise a data stream so other devices can discover and connect to it:

```python
from maestra import StreamPublisher, StreamAdvertiseParams

publisher = StreamPublisher(client, StreamAdvertiseParams(
    name="Camera A",
    stream_type="ndi",
    publisher_id="python-01",
    protocol="ndi",
    address="192.168.1.50",
    port=5960,
))

stream = await publisher.start()   # Advertise + automatic heartbeat
# ... stream stays discoverable ...
await publisher.stop()              # Remove stream when done
```

## Quick one-off updates (no SDK needed)

For simple scripts that just need to push a value, you can publish directly over MQTT without installing the Maestra SDK:

```python
import paho.mqtt.client as mqtt
import json

client = mqtt.Client()
client.connect("192.168.1.10", 1883)  # Maestra server IP
client.publish(
    "maestra/entity/state/update/gallery-light-1",
    json.dumps({"state": {"brightness": 75}, "source": "python-script"})
)
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — share video, audio, and data between devices
- [Python SDK Reference](../sdks/python.md) — full API details
