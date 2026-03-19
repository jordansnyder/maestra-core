# Arduino / ESP32

Connect microcontrollers to Maestra over WiFi. Works with any board that supports WiFi and the Arduino framework (ESP32, ESP8266, etc.).

## What you need

- **An ESP32 or similar WiFi-capable board**
- **PlatformIO** (recommended) or the Arduino IDE
- **The Maestra server's IP address** — ask your technical director or admin (e.g., `192.168.1.10`)
- Your board and the Maestra server must be on the **same WiFi network**

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, use your computer's local IP address (not `localhost` — the microcontroller needs a real network address). See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Install the library

Add these lines to your `platformio.ini`:

```ini
lib_deps =
    https://github.com/maestra/maestra-core#main
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0.0
```

## Step 2: Connect and read state

```cpp
#include <WiFi.h>
#include <MaestraClient.h>

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);

void setup() {
    // Connect to WiFi
    WiFi.begin("your-wifi-name", "your-wifi-password");
    while (WiFi.status() != WL_CONNECTED) delay(500);

    // Connect to Maestra
    maestra.setBroker("192.168.1.10", 1883);  // Your Maestra server IP
    maestra.connect();

    // Listen for state changes on an entity
    MaestraEntity* light = maestra.getEntity("gallery-light-1");
    light->onStateChange([](const char* slug, JsonObject state, JsonArray changed) {
        int brightness = state["brightness"];
        analogWrite(LED_PIN, map(brightness, 0, 100, 0, 255));
    });
}

void loop() {
    maestra.loop();  // Keep the connection alive
}
```

Replace the WiFi credentials and IP address with your own.

## Step 3: Send sensor data

```cpp
MaestraEntity* sensor = maestra.getEntity("temperature-sensor");

// Send a single value
sensor->updateState("temperature", 23.5);

// Send multiple values at once
StaticJsonDocument<256> doc;
JsonObject state = doc.to<JsonObject>();
state["temperature"] = 23.5;
state["humidity"] = 65;
sensor->updateState(state);
```

Any device connected to Maestra — a TouchDesigner patch, a web dashboard, another Arduino — will receive these values instantly.

## How it connects

Arduino communicates with Maestra using **MQTT**, a lightweight messaging protocol designed for small devices. You don't need to know the details — the library handles it — but if you're curious:

| What happens | MQTT topic used |
|--------------|-----------------|
| Send a value update | `maestra/entity/state/update/<slug>` |
| Replace all values | `maestra/entity/state/set/<slug>` |
| Receive changes | `maestra/entity/state/+/<slug>` |

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — advertise sensor data streams for other devices to discover
- [Arduino SDK Reference](../sdks/arduino.md) — full API details and stream examples
