# MaestraClient for Processing

MQTT-based SDK for connecting Processing sketches to the Maestra platform.

## Installation

### Dependencies

Install the **processing-mqtt** library:
1. In Processing: Sketch > Import Library > Manage Libraries
2. Search for "mqtt" and install the library by 256dpi

### SDK Files

Copy the `src/maestra/` folder into your sketch directory, or add it to your Processing libraries path.

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

    // Get entity and subscribe
    MaestraEntity light = maestra.getEntity("room-light-1");
    light.onStateChange(new StateChangeCallback() {
        public void stateChanged(String slug, JSONObject state, JSONArray changed) {
            float brightness = state.getFloat("brightness");
            println("Brightness: " + brightness);
        }
    });
    maestra.subscribeEntity("room-light-1");
}

void draw() {
    maestra.update();  // Required - processes incoming messages
}

// Required MQTT callbacks
void clientConnected() { }
void messageReceived(String topic, byte[] payload) {
    maestra.messageReceived(topic, new String(payload));
}
void connectionLost() { maestra.connectionLost(); }
```

## API Reference

### MaestraClient

```java
// Configuration
void setBroker(String host, int port);
void setBroker(String host);  // default port 1883
void setClientId(String clientId);
void setCredentials(String username, String password);

// Connection
boolean connect();
void disconnect();
boolean isConnected();
void update();  // MUST call in draw()

// Entities
MaestraEntity getEntity(String slug);
void subscribeEntity(String slug);
void subscribeAllEntities(WildcardEntityCallback callback);
void subscribeEntityType(String type, WildcardEntityCallback callback);

// Streams
void advertiseStream(String name, String streamType, String protocol, String address, int port);
void withdrawStream(String streamId);
void streamHeartbeat(String streamId);
void subscribeStreamEvents(StreamAdvertisedCallback callback);
void subscribeStreamType(String streamType, StreamAdvertisedCallback callback);
```

### MaestraEntity

```java
// State access
MaestraEntityState state();
float val = entity.state().getFloat("brightness", 0.0);

// State updates
void updateState(JSONObject updates);       // Merge
void updateState(String key, Object value); // Single value
void setState(JSONObject newState);         // Replace

// Subscriptions
void onStateChange(StateChangeCallback callback);
```

### MaestraEntityState

```java
// Typed getters
String getString(String key, String defaultValue);
int getInt(String key, int defaultValue);
float getFloat(String key, float defaultValue);
boolean getBoolean(String key, boolean defaultValue);
JSONObject getJSONObject(String key);
boolean has(String key);
JSONObject data();  // Full state
```

## Threading

The processing-mqtt library delivers MQTT messages on a background thread. MaestraClient uses
a thread-safe queue internally. You **must** call `maestra.update()` in your `draw()` function
to process incoming messages on the main thread. State change callbacks are always invoked on
the main thread, so it is safe to update Processing graphics from within them.

## MQTT Callbacks

Processing-mqtt requires three callback functions in your sketch. Route them to MaestraClient:

```java
void clientConnected() { }
void messageReceived(String topic, byte[] payload) {
    maestra.messageReceived(topic, new String(payload));
}
void connectionLost() { maestra.connectionLost(); }
```

## Message Topics

**Subscribe to state changes:**
```
maestra/entity/state/+/<entity-slug>
```

**Publish state updates:**
```
maestra/entity/state/update/<entity-slug>
maestra/entity/state/set/<entity-slug>
```

## Examples

See the `examples/` directory for complete examples.

## License

MIT
