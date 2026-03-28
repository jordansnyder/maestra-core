# OpenFrameworks SDK

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

Copy `sdks/openframeworks/ofxMaestra/` into your `addons/` directory. Add both addons to your project:

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

        light = maestra.getEntity("gallery-light-1");
        light->onStateChange([](const std::string& slug, const ofJson& state,
                                const std::vector<std::string>& changed) {
            float brightness = state.value("brightness", 0.0f);
            ofLogNotice() << "Brightness: " << brightness;
        });
        maestra.subscribeEntity("gallery-light-1");
    }

    void update() {
        maestra.update();  // Required - processes MQTT events
    }
};
```

## Entity State

The OF SDK updates entity state via MQTT topics — no HTTP required:

```cpp
MaestraEntity* sensor = maestra.getEntity("temperature-sensor");

// Update single value (merge with existing state)
sensor->updateState("temperature", 23.5);

// Update multiple values
ofJson state;
state["temperature"] = 23.5;
state["humidity"] = 65;
sensor->updateState(state);

// Replace entire state
sensor->setState(state);

// Read cached state (templated getters)
float temp = sensor->state().get<float>("temperature", 0.0f);
std::string color = sensor->state().get<std::string>("color", "#ffffff");
bool active = sensor->state().get<bool>("active", false);
```

**MQTT topics used:**

| Operation | Topic |
|-----------|-------|
| Merge state | `maestra/entity/state/update/<slug>` |
| Replace state | `maestra/entity/state/set/<slug>` |
| Receive changes | `maestra/entity/state/+/<slug>` |

## Wildcard Subscriptions

```cpp
// Subscribe to ALL entity state changes
maestra.subscribeAllEntities([](const std::string& type, const std::string& slug,
                                 const ofJson& state, const std::vector<std::string>& changed) {
    ofLogNotice() << type << "/" << slug << " changed";
});

// Subscribe to a specific entity type
maestra.subscribeEntityType("light", [](const std::string& type, const std::string& slug,
                                         const ofJson& state, const std::vector<std::string>& changed) {
    float brightness = state.value("brightness", 0.0f);
});
```

## Streams

```cpp
// Subscribe to stream discovery events
maestra.subscribeStreamEvents([](const std::string& id, const std::string& name,
                                  const std::string& type, const std::string& addr, int port) {
    ofLogNotice() << "Stream: " << name << " (" << type << ") at " << addr << ":" << port;
});

// Advertise a data stream
maestra.advertiseStream("Visual Output", "video", "ndi", "192.168.1.50", 5960);
```

See [Streams Guide](../guides/streams.md) for more stream examples.

## Threading

ofxMQTT handles threading internally. Messages are delivered on the main thread when
`maestra.update()` is called in `ofApp::update()`. All state change callbacks are invoked
on the main thread, so it is safe to modify OF graphics state from within them.

See `sdks/openframeworks/ofxMaestra/README.md` for full documentation.
