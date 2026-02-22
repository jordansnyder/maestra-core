# Device Registration Guide

This guide covers registering devices with the Maestra Fleet Manager and maintaining connectivity through heartbeats.

## Overview

Device registration creates a record in the Fleet Manager database and provides a unique device ID for subsequent operations. All devices must register before publishing metrics or receiving commands.

## Registration Endpoint

**POST** `http://localhost:8080/devices/register`

### Request Body

```json
{
  "name": "Arduino Sensor 1",
  "device_type": "arduino",
  "hardware_id": "AA:BB:CC:DD:EE:FF",
  "firmware_version": "1.0.0",
  "ip_address": "192.168.1.100",
  "location": {
    "building": "Main",
    "floor": 1,
    "room": "Lab"
  },
  "metadata": {
    "serial_number": "ARD-12345",
    "manufacturer": "Arduino",
    "model": "Uno R3"
  }
}
```

### Required Fields

- `name` - Human-readable device name
- `device_type` - Type of device (arduino, esp32, raspberry_pi, touchdesigner, max_msp, etc.)
- `hardware_id` - Unique hardware identifier (MAC address, serial number, UUID)

### Optional Fields

- `firmware_version` - Firmware/software version
- `ip_address` - Device IP address
- `location` - JSONB object with location data
- `metadata` - JSONB object with custom metadata

### Response

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Arduino Sensor 1",
  "device_type": "arduino",
  "hardware_id": "AA:BB:CC:DD:EE:FF",
  "status": "online",
  "created_at": "2026-02-02T12:34:56.789Z"
}
```

**Important**: Save the `id` field - this is your device ID for all subsequent API calls.

## Heartbeat System

Devices must send periodic heartbeats to maintain "online" status. Without heartbeats, devices are marked "offline" after 5 minutes of inactivity.

**POST** `http://localhost:8080/devices/heartbeat`

### Request Body

```json
{
  "device_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

### Response

```json
{
  "device_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "online",
  "last_seen": "2026-02-02T12:35:00.000Z"
}
```

### Recommended Interval

Send heartbeats every **30 seconds**. This provides:
- Reasonable real-time status tracking
- Low network overhead
- 10x safety margin before offline detection

## Device Lifecycle

```
Register → Online → Heartbeats → (no heartbeat for 5 min) → Offline
                   ↓
                Metrics/Events
```

**Status Values**:
- `online` - Device is connected and sending heartbeats
- `offline` - No heartbeat received for 5+ minutes
- `error` - Device reported error status
- `maintenance` - Manually set by administrator

## SDK Examples

### Arduino/ESP32

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* apiUrl = "http://maestra-host:8080";
String deviceId = "";

void setup() {
  Serial.begin(115200);
  WiFi.begin("SSID", "password");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  // Register device
  deviceId = registerDevice();
  Serial.println("Registered with ID: " + deviceId);
}

String registerDevice() {
  HTTPClient http;
  http.begin(String(apiUrl) + "/devices/register");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["name"] = "ESP32 Sensor";
  doc["device_type"] = "esp32";
  doc["hardware_id"] = WiFi.macAddress();
  doc["firmware_version"] = "1.0.0";
  doc["ip_address"] = WiFi.localIP().toString();

  JsonObject location = doc.createNestedObject("location");
  location["room"] = "Workshop";

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  String response = http.getString();
  http.end();

  // Parse response and extract device_id
  StaticJsonDocument<512> responseDoc;
  deserializeJson(responseDoc, response);
  return responseDoc["id"].as<String>();
}

void sendHeartbeat() {
  HTTPClient http;
  http.begin(String(apiUrl) + "/devices/heartbeat");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["device_id"] = deviceId;

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();
}

void loop() {
  static unsigned long lastHeartbeat = 0;
  unsigned long now = millis();

  // Send heartbeat every 30 seconds
  if (now - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  // Your device logic here
  delay(100);
}
```

### Python (Raspberry Pi, PC)

```python
import requests
import time
import uuid
from typing import Optional

class MaestraDevice:
    def __init__(self, api_url: str = "http://localhost:8080"):
        self.api_url = api_url
        self.device_id: Optional[str] = None

    def register(self, name: str, device_type: str, hardware_id: Optional[str] = None):
        """Register device with Fleet Manager"""
        if hardware_id is None:
            hardware_id = str(uuid.uuid4())

        data = {
            "name": name,
            "device_type": device_type,
            "hardware_id": hardware_id,
            "firmware_version": "1.0.0",
            "metadata": {
                "python_version": "3.11"
            }
        }

        response = requests.post(
            f"{self.api_url}/devices/register",
            json=data
        )
        response.raise_for_status()

        result = response.json()
        self.device_id = result["id"]
        print(f"✅ Registered as {self.device_id}")
        return self.device_id

    def heartbeat(self):
        """Send heartbeat to maintain online status"""
        if not self.device_id:
            raise Exception("Device not registered")

        response = requests.post(
            f"{self.api_url}/devices/heartbeat",
            json={"device_id": self.device_id}
        )
        response.raise_for_status()

    def start_heartbeat_loop(self, interval: int = 30):
        """Start background heartbeat thread"""
        import threading

        def heartbeat_thread():
            while True:
                try:
                    self.heartbeat()
                    time.sleep(interval)
                except Exception as e:
                    print(f"❌ Heartbeat failed: {e}")
                    time.sleep(interval)

        thread = threading.Thread(target=heartbeat_thread, daemon=True)
        thread.start()

# Usage
device = MaestraDevice("http://localhost:8080")
device.register("Python Sensor", "raspberry_pi", "rpi-001")
device.start_heartbeat_loop()

# Your device logic
while True:
    # Do work
    time.sleep(1)
```

## Best Practices

### 1. Cache Device ID

Save the device ID after registration to avoid duplicate registrations:

```python
import json
import os

DEVICE_ID_FILE = "device_id.txt"

# Try to load existing device ID
if os.path.exists(DEVICE_ID_FILE):
    with open(DEVICE_ID_FILE) as f:
        device_id = f.read().strip()
else:
    # Register and save
    device_id = register_device()
    with open(DEVICE_ID_FILE, "w") as f:
        f.write(device_id)
```

### 2. Retry Logic

Implement exponential backoff for failed requests:

```python
def register_with_retry(max_retries=5):
    for i in range(max_retries):
        try:
            return register_device()
        except Exception as e:
            wait = 2 ** i  # Exponential backoff: 1, 2, 4, 8, 16 seconds
            print(f"Registration failed, retrying in {wait}s: {e}")
            time.sleep(wait)

    raise Exception("Registration failed after retries")
```

### 3. Graceful Shutdown

Send final heartbeat or status update on shutdown:

```python
import signal
import sys

def signal_handler(sig, frame):
    print("Shutting down...")
    # Optionally mark as offline or maintenance
    requests.patch(
        f"{api_url}/devices/{device_id}",
        json={"status": "maintenance"}
    )
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
```

### 4. Include Useful Metadata

Add metadata that helps with debugging and management:

```json
{
  "metadata": {
    "serial_number": "ABC123",
    "hardware_version": "2.1",
    "sdk_version": "1.2.3",
    "location_notes": "Next to door",
    "contact": "admin@example.com"
  }
}
```

## Troubleshooting

### 409 Conflict - Device Already Registered

**Error**: Device with this `hardware_id` already exists.

**Solution**: Check if device is already registered and use existing device ID:

```python
response = requests.post(f"{api_url}/devices/register", json=data)

if response.status_code == 409:
    # Get existing device by hardware_id
    devices = requests.get(f"{api_url}/devices").json()
    existing = next(d for d in devices if d["hardware_id"] == hardware_id)
    device_id = existing["id"]
    print(f"Using existing device: {device_id}")
```

### Device Marked Offline

**Issue**: Device shows as offline despite sending heartbeats.

**Checklist**:
1. Verify heartbeat interval is < 5 minutes
2. Check API URL is correct
3. Ensure device_id is valid
4. Check for network connectivity issues
5. Look for errors in device logs

### Connection Refused

**Issue**: Cannot connect to Fleet Manager API.

**Solutions**:
- Verify Fleet Manager is running: `docker ps | grep fleet-manager`
- Check port 8080 is accessible: `curl http://localhost:8080/health`
- From external device, use host IP instead of localhost
- Check firewall rules

### High Heartbeat Frequency Warning

**Issue**: Sending heartbeats too frequently (< 10 seconds).

**Impact**: Unnecessary network and database load.

**Solution**: Increase interval to 30-60 seconds.

## Related Documentation

- [Fleet Manager API](../api/fleet-manager.md) - Complete API reference
- [Metrics Publishing](../api/fleet-manager.md#metrics) - Publishing device metrics
- [MQTT Integration](mqtt.md) - Alternative connectivity via MQTT
