# Processing SDK

## Installation

Install the **processing-mqtt** library:

1. In Processing: Sketch > Import Library > Manage Libraries
2. Search for "mqtt" and install the library by 256dpi

Copy the `sdks/processing/MaestraClient/src/maestra/` folder into your sketch directory.

## Quick Start

```java
import mqtt.*;
import maestra.*;

MaestraClient maestra;

void setup() {
    size(800, 600);

    maestra = new MaestraClient(this);
    maestra.setBroker("192.168.1.100", 1883);
    maestra.setClientId("my-sketch");
    maestra.connect();

    MaestraEntity light = maestra.getEntity("gallery-light-1");
    light.onStateChange(new StateChangeCallback() {
        public void stateChanged(String slug, JSONObject state, JSONArray changed) {
            float brightness = state.getFloat("brightness");
            println("Brightness: " + brightness);
        }
    });
    maestra.subscribeEntity("gallery-light-1");
}

void draw() {
    maestra.update();  // Required - processes MQTT messages
}

// Required MQTT callbacks
void clientConnected() { }
void messageReceived(String topic, byte[] payload) {
    maestra.messageReceived(topic, new String(payload));
}
void connectionLost() { maestra.connectionLost(); }
```

## Entity State

The Processing SDK updates entity state via MQTT topics — no HTTP required:

```java
MaestraEntity sensor = maestra.getEntity("temperature-sensor");

// Update single value (merge with existing state)
sensor.updateState("temperature", 23.5);

// Update multiple values
JSONObject state = new JSONObject();
state.put("temperature", 23.5);
state.put("humidity", 65);
sensor.updateState(state);

// Replace entire state
sensor.setState(state);

// Read cached state
float temp = sensor.state().getFloat("temperature", 0.0);
boolean active = sensor.state().getBoolean("active", false);
```

**MQTT topics used:**

| Operation | Topic |
|-----------|-------|
| Merge state | `maestra/entity/state/update/<slug>` |
| Replace state | `maestra/entity/state/set/<slug>` |
| Receive changes | `maestra/entity/state/+/<slug>` |

## Wildcard Subscriptions

```java
// Subscribe to ALL entity state changes
maestra.subscribeAllEntities(new WildcardEntityCallback() {
    public void stateChanged(String type, String slug, JSONObject state, JSONArray changed) {
        println(type + "/" + slug + " changed");
    }
});

// Subscribe to a specific entity type
maestra.subscribeEntityType("light", new WildcardEntityCallback() {
    public void stateChanged(String type, String slug, JSONObject state, JSONArray changed) {
        float brightness = state.getFloat("brightness");
    }
});
```

## Streams

```java
// Subscribe to stream discovery events
maestra.subscribeStreamEvents(new StreamAdvertisedCallback() {
    public void streamAdvertised(String id, String name, String type, String addr, int port) {
        println("Stream: " + name + " (" + type + ") at " + addr + ":" + port);
    }
});

// Advertise a data stream
maestra.advertiseStream("Visual Output", "video", "ndi", "192.168.1.50", 5960);
```

See [Streams Guide](../guides/streams.md) for more stream examples.

## Threading

The processing-mqtt library delivers MQTT messages on a background thread. MaestraClient
buffers messages in a thread-safe queue and processes them when you call `maestra.update()`
in `draw()`. All state change callbacks are invoked on the main thread.

See `sdks/processing/MaestraClient/README.md` for full documentation.
