# Arduino/ESP32 SDK

Connect your Arduino, ESP32, or ESP8266 devices to Maestra using MQTT.

## Overview

Maestra supports Arduino-based devices through MQTT messaging. This allows your microcontrollers to:

- Send sensor data to the cloud
- Receive commands from the dashboard
- Participate in synchronized experiences
- Report status and heartbeats

## Prerequisites

- Arduino IDE or PlatformIO
- Arduino/ESP32/ESP8266 board
- WiFi connectivity (ESP32/ESP8266)
- Ethernet shield (for Arduino Uno/Mega)

## Required Libraries

Install these libraries through Arduino Library Manager:

- **PubSubClient** (MQTT)
- **WiFi** (built-in for ESP32/ESP8266)
- **ArduinoJson** (optional, for JSON payloads)

## Basic Example (ESP32)

### 1. Setup

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Maestra MQTT broker
const char* mqtt_server = "YOUR_MAESTRA_IP";  // e.g., "192.168.1.100"
const int mqtt_port = 1883;

// Device info
const char* device_id = "ESP32-001";
const char* hardware_id = "AA:BB:CC:DD:EE:FF";

WiFiClient espClient;
PubSubClient client(espClient);
```

### 2. Connect to WiFi

```cpp
void setup_wifi() {
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}
```

### 3. Connect to MQTT

```cpp
void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting to MQTT...");

    if (client.connect(device_id)) {
      Serial.println("connected!");

      // Subscribe to command topic
      client.subscribe("maestra/devices/ESP32-001/commands");

      // Publish online status
      client.publish("maestra/devices/ESP32-001/status", "online");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}
```

### 4. Handle Messages

```cpp
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("]: ");

  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Handle commands
  if (String(topic) == "maestra/devices/ESP32-001/commands") {
    if (message == "LED_ON") {
      digitalWrite(LED_BUILTIN, HIGH);
    } else if (message == "LED_OFF") {
      digitalWrite(LED_BUILTIN, LOW);
    }
  }
}
```

### 5. Main Loop

```cpp
void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Send sensor data every 10 seconds
  static unsigned long lastMsg = 0;
  unsigned long now = millis();

  if (now - lastMsg > 10000) {
    lastMsg = now;

    // Read sensor (example: temperature)
    float temperature = 25.5;  // Replace with actual sensor reading

    // Publish to MQTT
    char msg[50];
    snprintf(msg, 50, "{\"temperature\": %.2f}", temperature);
    client.publish("maestra/devices/ESP32-001/sensors/temperature", msg);
  }
}
```

## Complete Example

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.100";
const int mqtt_port = 1883;
const char* device_id = "ESP32-001";

WiFiClient espClient;
PubSubClient client(espClient);

// Topics
const char* topic_status = "maestra/devices/ESP32-001/status";
const char* topic_sensors = "maestra/devices/ESP32-001/sensors";
const char* topic_commands = "maestra/devices/ESP32-001/commands";

void setup_wifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Received: ");
  Serial.println(message);

  // Parse JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (!error) {
    const char* command = doc["command"];

    if (strcmp(command, "LED_ON") == 0) {
      digitalWrite(LED_BUILTIN, HIGH);
      publishStatus("LED is ON");
    } else if (strcmp(command, "LED_OFF") == 0) {
      digitalWrite(LED_BUILTIN, LOW);
      publishStatus("LED is OFF");
    }
  }
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect(device_id)) {
      client.subscribe(topic_commands);
      publishStatus("online");
    } else {
      delay(5000);
    }
  }
}

void publishStatus(const char* status) {
  StaticJsonDocument<200> doc;
  doc["device_id"] = device_id;
  doc["status"] = status;
  doc["timestamp"] = millis();

  char buffer[200];
  serializeJson(doc, buffer);
  client.publish(topic_status, buffer);
}

void publishSensorData(float temperature, float humidity) {
  StaticJsonDocument<200> doc;
  doc["device_id"] = device_id;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["timestamp"] = millis();

  char buffer[200];
  serializeJson(doc, buffer);
  client.publish(topic_sensors, buffer);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Send sensor data every 10 seconds
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 10000) {
    lastMsg = millis();

    // Read sensors (example values)
    float temp = random(200, 300) / 10.0;
    float humidity = random(400, 600) / 10.0;

    publishSensorData(temp, humidity);
  }
}
```

## Register Device

Before using your device, register it through the dashboard:

1. Open http://localhost:3001
2. Click **"+ Register Device"**
3. Fill in:
   - **Name**: My ESP32 Sensor
   - **Type**: esp32
   - **Hardware ID**: AA:BB:CC:DD:EE:FF (MAC address)
   - **IP Address**: 192.168.1.50 (optional)

## Topic Conventions

### Status Updates
```
maestra/devices/{device_id}/status
```

### Sensor Data
```
maestra/devices/{device_id}/sensors/{sensor_name}
```

### Commands (Subscribe)
```
maestra/devices/{device_id}/commands
```

### Events
```
maestra/devices/{device_id}/events/{event_type}
```

## Advanced Features

### Heartbeat

Send periodic heartbeats to show device is alive:

```cpp
void sendHeartbeat() {
  StaticJsonDocument<100> doc;
  doc["status"] = "online";
  doc["uptime"] = millis();

  char buffer[100];
  serializeJson(doc, buffer);
  client.publish("maestra/devices/ESP32-001/heartbeat", buffer);
}

// In loop()
if (millis() - lastHeartbeat > 60000) {  // Every minute
  lastHeartbeat = millis();
  sendHeartbeat();
}
```

### Error Reporting

```cpp
void reportError(const char* error) {
  StaticJsonDocument<200> doc;
  doc["severity"] = "error";
  doc["message"] = error;
  doc["timestamp"] = millis();

  char buffer[200];
  serializeJson(doc, buffer);
  client.publish("maestra/devices/ESP32-001/errors", buffer);
}
```

## PlatformIO Configuration

`platformio.ini`:

```ini
[env:esp32]
platform = espressif32
board = esp32dev
framework = arduino

lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.0

monitor_speed = 115200
```

## Troubleshooting

### Can't Connect to WiFi
- Check SSID and password
- Verify WiFi is 2.4GHz (ESP32/ESP8266 don't support 5GHz)
- Check signal strength

### MQTT Connection Fails
- Verify Maestra IP address
- Check port 1883 is accessible
- Look at Mosquitto logs: `make logs-service SERVICE=mosquitto`

### Messages Not Received
- Verify topic names match exactly
- Check MQTT broker logs
- Use MQTT client to test: `mosquitto_sub -t '#' -v`

## Next Steps

- [MQTT Guide](../guides/mqtt.md)
- [Create Node-RED flows](../guides/nodered.md)
- [View in Dashboard](http://localhost:3001)

---

**Build amazing IoT experiences! 🤖**
