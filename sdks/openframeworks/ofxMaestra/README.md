# ofxMaestra - OpenFrameworks Addon

MQTT-based SDK for connecting OpenFrameworks apps to the Maestra platform.

## Installation

### Dependencies

1. Install [ofxMQTT](https://github.com/256dpi/ofxMQTT) addon:
   ```bash
   cd openframeworks/addons
   git clone https://github.com/256dpi/ofxMQTT.git
   ```

2. Install libmosquitto (required by ofxMQTT):
   ```bash
   # macOS
   brew install mosquitto

   # Ubuntu/Debian
   sudo apt-get install libmosquitto-dev
   ```

### Addon Setup

Clone or copy `ofxMaestra` into your `addons/` directory:
```bash
cd openframeworks/addons
git clone https://github.com/maestra/maestra-core.git
# or copy sdks/openframeworks/ofxMaestra/ directly
```

Add both addons to your project (in `addons.make` or Project Generator):
```
ofxMQTT
ofxMaestra
```

## Quick Start

```cpp
#include "ofxMaestra.h"

class ofApp : public ofBaseApp {
    ofxMaestra maestra;
    MaestraEntity* light;

    void setup() {
        maestra.setBroker("192.168.1.100", 1883);
        maestra.setClientId("my-of-app");
        maestra.connect();

        light = maestra.getEntity("room-light-1");
        light->onStateChange([](const std::string& slug, const ofJson& state,
                                const std::vector<std::string>& changed) {
            float brightness = state.value("brightness", 0.0f);
            ofLogNotice() << "Brightness: " << brightness;
        });
        maestra.subscribeEntity("room-light-1");
    }

    void update() {
        maestra.update();  // Required - processes MQTT events
    }
};
```

## API Reference

### ofxMaestra

```cpp
// Configuration
void setBroker(const std::string& host, int port = 1883);
void setClientId(const std::string& clientId);
void setCredentials(const std::string& username, const std::string& password);

// Connection
bool connect();
void disconnect();
bool isConnected() const;
void update();  // Call in ofApp::update()

// Entities
MaestraEntity* getEntity(const std::string& slug);
void subscribeEntity(const std::string& slug);
void subscribeAllEntities(MaestraWildcardCallback callback);
void subscribeEntityType(const std::string& type, MaestraWildcardCallback callback);

// Streams
void advertiseStream(name, streamType, protocol, address, port, publisherId);
void withdrawStream(const std::string& streamId);
void streamHeartbeat(const std::string& streamId);
void subscribeStreamEvents(MaestraStreamCallback callback);
void subscribeStreamType(const std::string& streamType, MaestraStreamCallback callback);
```

### MaestraEntity

```cpp
// State access (templated)
float val = entity->state().get<float>("brightness", 0.0f);
std::string color = entity->state().get<std::string>("color", "#fff");

// State updates
void updateState(const ofJson& updates);              // Merge
void updateState(const std::string& key, const ofJson& value);  // Single value
void setState(const ofJson& newState);                 // Replace

// Subscriptions
void onStateChange(MaestraStateChangeCallback callback);
```

### MaestraEntityState

```cpp
template<typename T> T get(const std::string& key, T defaultValue) const;
bool has(const std::string& key) const;
const ofJson& data() const;
```

## Threading

ofxMQTT handles threading internally. Messages are delivered on the main thread when
`maestra.update()` is called in your `ofApp::update()`. State change callbacks are
always invoked on the main thread, so it is safe to modify OF graphics state from
within them.

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

See the `example-BasicUsage/` directory for a complete example.

## License

MIT
