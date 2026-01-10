# Maestra Python SDK

Python SDK for the Maestra immersive experience platform.

## Installation

```bash
# Basic installation (HTTP only)
pip install maestra

# With NATS support
pip install maestra[nats]

# With MQTT support
pip install maestra[mqtt]

# Full installation (all transports)
pip install maestra[all]
```

## Quick Start

```python
import asyncio
from maestra import MaestraClient, ConnectionConfig

async def main():
    # Connect to Maestra
    client = MaestraClient(ConnectionConfig(
        api_url="http://localhost:8080",
        nats_url="nats://localhost:4222",
        mqtt_broker="localhost",
    ))
    await client.connect()

    # Get an entity
    light = await client.get_entity_by_slug("room-a-light-1")
    print(f"Light state: {light.state.data}")

    # Update state
    await light.state.update({"brightness": 75})

    # Subscribe to state changes
    def on_state_change(event):
        print(f"State changed: {event.changed_keys}")
        print(f"New state: {event.current_state}")

    unsubscribe = light.state.on_change(on_state_change)
    await light.subscribe()

    # Keep running to receive updates
    await asyncio.sleep(60)

    # Cleanup
    unsubscribe()
    await client.disconnect()

asyncio.run(main())
```

## Entity Management

```python
# List all entities
entities = await client.get_entities()

# Filter by type
rooms = await client.get_entities(entity_type="room")

# Get entity types
types = await client.get_entity_types()

# Create a new entity
light = await client.create_entity(
    name="Room A Light 1",
    entity_type_id="<actuator-type-id>",
    parent_id="<room-a-id>",
    state={"brightness": 0, "color": "#ffffff"},
)

# Get entity hierarchy
ancestors = await light.get_ancestors()
children = await light.get_children()
```

## State Operations

```python
# Get current state
print(light.state.data)
print(light.state.get("brightness"))
print(light.state["color"])

# Update state (merge)
await light.state.update({
    "brightness": 100,
    "transition": 500,
})

# Replace entire state
await light.state.replace({
    "brightness": 0,
    "color": "#000000",
})

# Set single value
await light.state.set("brightness", 50)
```

## Real-time Subscriptions

```python
# Subscribe to entity state changes
def handle_change(event):
    print(f"Entity: {event.entity_slug}")
    print(f"Changed: {event.changed_keys}")
    print(f"Previous: {event.previous_state}")
    print(f"Current: {event.current_state}")

light.state.on_change(handle_change)
await light.subscribe()

# The callback will fire when any device updates the state
```

## Connection Options

```python
from maestra import ConnectionConfig

# HTTP only (no real-time)
config = ConnectionConfig(
    api_url="http://localhost:8080",
    nats_url=None,
    mqtt_broker=None,
)

# With NATS
config = ConnectionConfig(
    api_url="http://localhost:8080",
    nats_url="nats://localhost:4222",
)

# With MQTT
config = ConnectionConfig(
    api_url="http://localhost:8080",
    mqtt_broker="localhost",
    mqtt_port=1883,
)

# Custom client ID
config = ConnectionConfig(
    api_url="http://localhost:8080",
    client_id="my-python-app",
)
```

## License

MIT
