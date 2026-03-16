# Arduino/ESP32 SDK

## Installation

Add to `platformio.ini`:

```ini
lib_deps =
    https://github.com/maestra/maestra-core#main
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0.0
```

## Quick Start

```cpp
#include <WiFi.h>
#include <MaestraClient.h>

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);

void setup() {
    WiFi.begin("ssid", "password");
    while (WiFi.status() != WL_CONNECTED) delay(500);

    maestra.setBroker("192.168.1.100", 1883);
    maestra.connect();

    MaestraEntity* light = maestra.getEntity("gallery-light-1");
    light->onStateChange([](const char* slug, JsonObject state, JsonArray changed) {
        int brightness = state["brightness"];
        analogWrite(LED_PIN, map(brightness, 0, 100, 0, 255));
    });
}

void loop() {
    maestra.loop();
}
```

## Entity State

The Arduino SDK updates entity state via MQTT topics — no HTTP required:

```cpp
MaestraEntity* sensor = maestra.getEntity("temperature-sensor");

// Update single value (merge with existing state)
sensor->updateState("temperature", 23.5);

// Update multiple values
StaticJsonDocument<256> doc;
JsonObject state = doc.to<JsonObject>();
state["temperature"] = 23.5;
state["humidity"] = 65;
sensor->updateState(state);

// Replace entire state
sensor->setState(state);

// Subscribe to state changes from other devices
sensor->onStateChange([](const char* slug, JsonObject state, JsonArray changed) {
    float temp = state["temperature"];
    Serial.printf("Temperature: %.1f\n", temp);
});
```

**MQTT topics used:**

| Operation | Topic |
|-----------|-------|
| Merge state | `maestra/entity/state/update/<slug>` |
| Replace state | `maestra/entity/state/set/<slug>` |
| Receive changes | `maestra/entity/state/+/<slug>` |

## Streams

```cpp
// Subscribe to stream discovery events
maestra.subscribeStreamEvents([](const char* id, const char* name,
                                  const char* type, const char* addr, int port) {
    Serial.printf("Stream: %s (%s) at %s:%d\n", name, type, addr, port);
});

// Advertise a sensor data stream
maestra.advertiseStream("Temp Sensor", "sensor", "udp",
                         WiFi.localIP().toString().c_str(), 8888);
```

See [Streams Guide](../guides/streams.md) for more stream examples.

See `sdks/arduino/MaestraClient/README.md` for full documentation.
