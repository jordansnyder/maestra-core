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

See `sdks/arduino/MaestraClient/README.md` for full documentation.
