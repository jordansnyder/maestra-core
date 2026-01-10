# MaestraClient for Arduino/ESP32

MQTT-based SDK for connecting Arduino and ESP32 devices to the Maestra platform.

## Installation

### PlatformIO (recommended)

Add to your `platformio.ini`:

```ini
lib_deps =
    https://github.com/maestra/maestra-core#main
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0.0
```

### Arduino IDE

1. Download this library as a ZIP
2. In Arduino IDE: Sketch → Include Library → Add .ZIP Library

## Quick Start

```cpp
#include <WiFi.h>
#include <MaestraClient.h>

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);

void setup() {
    Serial.begin(115200);

    // Connect to WiFi
    WiFi.begin("your-ssid", "your-password");
    while (WiFi.status() != WL_CONNECTED) delay(500);

    // Connect to Maestra
    maestra.setBroker("192.168.1.100", 1883);
    maestra.setClientId("my-esp32");
    maestra.connect();

    // Get entity and subscribe
    MaestraEntity* light = maestra.getEntity("room-a-light-1");
    light->onStateChange([](const char* slug, JsonObject state, JsonArray changed) {
        int brightness = state["brightness"];
        analogWrite(LED_PIN, map(brightness, 0, 100, 0, 255));
    });
    maestra.subscribeEntity("room-a-light-1");
}

void loop() {
    maestra.loop();
}
```

## API Reference

### MaestraClient

```cpp
// Configuration
void setBroker(const char* host, uint16_t port = 1883);
void setClientId(const char* clientId);
void setCredentials(const char* username, const char* password);

// Connection
bool connect();
void disconnect();
bool isConnected();
void loop();  // Call in loop()

// Entities
MaestraEntity* getEntity(const char* slug);
void subscribeEntity(const char* slug);
```

### MaestraEntity

```cpp
// State access
MaestraEntityState& state();
int value = entity->state().get<int>("brightness", 0);

// State updates
void updateState(JsonObject updates);  // Merge
void updateState(const char* key, JsonVariant value);  // Single value
void setState(JsonObject newState);  // Replace

// Subscriptions
void onStateChange(StateChangeCallback callback);
```

### MaestraEntityState

```cpp
// Get values
T get<T>(const char* key, T defaultValue);
bool has(const char* key);
JsonObject data();
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
