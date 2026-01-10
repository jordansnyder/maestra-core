/**
 * Maestra Basic Usage Example
 *
 * This example demonstrates how to:
 * - Connect to the Maestra MQTT broker
 * - Subscribe to entity state changes
 * - Update entity state
 * - React to state changes
 */

#include <WiFi.h>
#include <MaestraClient.h>

// WiFi credentials
const char* WIFI_SSID = "your-wifi-ssid";
const char* WIFI_PASSWORD = "your-wifi-password";

// Maestra MQTT broker
const char* MQTT_HOST = "192.168.1.100";  // Your Maestra host
const int MQTT_PORT = 1883;

// Entity configuration
const char* ENTITY_SLUG = "my-esp32-device";

// LED pin for visual feedback
const int LED_PIN = 2;

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);
MaestraEntity* myEntity = nullptr;

void setupWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected! IP: ");
  Serial.println(WiFi.localIP());
}

void onStateChange(const char* slug, JsonObject state, JsonArray changedKeys) {
  Serial.print("State changed for: ");
  Serial.println(slug);

  Serial.print("Changed keys: ");
  for (JsonVariant key : changedKeys) {
    Serial.print(key.as<const char*>());
    Serial.print(" ");
  }
  Serial.println();

  // React to brightness changes
  if (state.containsKey("brightness")) {
    int brightness = state["brightness"];
    Serial.print("Brightness: ");
    Serial.println(brightness);

    // Map brightness (0-100) to PWM (0-255)
    int pwm = map(brightness, 0, 100, 0, 255);
    analogWrite(LED_PIN, pwm);
  }

  // React to active state
  if (state.containsKey("active")) {
    bool active = state["active"];
    Serial.print("Active: ");
    Serial.println(active ? "true" : "false");

    if (!active) {
      digitalWrite(LED_PIN, LOW);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  Serial.println();
  Serial.println("🎭 Maestra Arduino Example");
  Serial.println("==========================");

  // Connect to WiFi
  setupWiFi();

  // Configure Maestra client
  maestra.setBroker(MQTT_HOST, MQTT_PORT);
  maestra.setClientId("esp32-example");

  // Connect to MQTT
  if (maestra.connect()) {
    // Get entity and subscribe
    myEntity = maestra.getEntity(ENTITY_SLUG);
    myEntity->onStateChange(onStateChange);
    maestra.subscribeEntity(ENTITY_SLUG);

    Serial.println("Ready! Waiting for state changes...");
  }
}

void loop() {
  // Handle MQTT messages
  maestra.loop();

  // Reconnect if needed
  if (!maestra.isConnected()) {
    Serial.println("Reconnecting...");
    if (maestra.connect()) {
      maestra.subscribeEntity(ENTITY_SLUG);
    }
    delay(5000);
    return;
  }

  // Example: Send sensor data every 10 seconds
  static unsigned long lastSend = 0;
  if (millis() - lastSend > 10000) {
    lastSend = millis();

    // Read some sensor value (simulated)
    int sensorValue = analogRead(A0);
    float temperature = sensorValue * 0.1;  // Simulated conversion

    // Update entity state
    StaticJsonDocument<256> doc;
    JsonObject state = doc.to<JsonObject>();
    state["temperature"] = temperature;
    state["uptime"] = millis() / 1000;

    myEntity->updateState(state);
    Serial.println("📤 Sent state update");
  }
}
