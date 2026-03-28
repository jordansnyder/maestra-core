# ESP32 OLED Artist Display

Displays artist information from a Maestra entity on an ER-OLEDM032-1 grayscale OLED (256x64, SSD1322 controller). Subscribes to entity state changes via MQTT and updates the display in real time.

```
================================
  ALEX CHEN                      <- inverted (artist name)
  Mixed media artist exploring   <- bio line 1
  light and shadow               <- bio line 2
  alexchen.art                   <- website / social
================================
```

## Hardware

- **Display**: ER-OLEDM032-1 (SSD1322, 256x64, 4-bit grayscale, SPI)
- **MCU**: ESP32-WROOM-32

### Wiring

| OLED Pin | ESP32 Pin | Notes |
|----------|-----------|-------|
| 1. GND   | GND       |       |
| 2. VCC   | 3.3V      |       |
| 4. SCL   | GPIO 18   | SPI Clock |
| 5. SDI   | GPIO 23   | SPI MOSI |
| 7-13     | GND       | Unused pins |
| 14. DC   | GPIO 17   | Data/Command |
| 15. RES  | GPIO 16   | Reset |
| 16. CS   | GPIO 5    | Chip Select |

**Important**: The display module must be jumpered for SPI mode: **R19, R23 shorted** and **R18, R20 open**.

## Prerequisites

- [PlatformIO CLI](https://docs.platformio.org/en/latest/core/installation.html) or VS Code with PlatformIO extension
- Maestra stack running with MQTT broker accessible

## Configuration

Edit the constants at the top of `src/main.cpp`:

```cpp
const char* WIFI_SSID     = "your-wifi-ssid";
const char* WIFI_PASSWORD = "your-wifi-password";
const char* MQTT_HOST     = "192.168.1.100";  // Your Maestra host IP
const int   MQTT_PORT     = 1883;
const char* ENTITY_SLUG   = "artist-slug";     // Entity to subscribe to
```

## Build & Flash

```bash
cd examples/esp32/oled-artist-display
pio run -t upload
pio device monitor
```

## Entity Setup

Create an artist entity type and entity in Maestra. The display expects these state fields:

| Field     | Type   | Description |
|-----------|--------|-------------|
| `name`    | string | Artist name (up to 32 chars) |
| `bio`     | string | Bio / description (up to 64 chars, auto-wraps to 2 lines) |
| `website` | string | Website or social handle (up to 32 chars) |

### Create via API

```bash
# Create artist entity type
curl -X POST http://localhost:8080/entities/types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "artist",
    "display_name": "Artist",
    "description": "Art show artist",
    "icon": "user"
  }'

# Create an artist entity (use the type ID from above)
curl -X POST http://localhost:8080/entities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Chen",
    "entity_type_id": "<artist-type-uuid>",
    "state": {
      "name": "Alex Chen",
      "bio": "Mixed media artist exploring light and shadow",
      "website": "alexchen.art"
    }
  }'
```

### Test with MQTT

Simulate a state update directly via MQTT:

```bash
mosquitto_pub -h localhost -t "maestra/entity/state/update/artist-slug" \
  -m '{"state":{"name":"Alex Chen","bio":"Mixed media artist exploring light and shadow","website":"alexchen.art"}}'
```

## Notes

- The built-in font covers ASCII 32-122 (space through 'z'). Characters outside this range (e.g., `|`, `{`, `~`) are replaced with spaces.
- Bio text longer than 32 characters automatically wraps to a second line at the nearest word boundary.
- The display shows connection status during boot and reconnection attempts.

## Troubleshooting

| Issue | Check |
|-------|-------|
| Blank display | Verify SPI wiring (SCL, SDI, DC, RES, CS). Ensure SPI jumpers are set correctly on the display module. |
| No data shown | Confirm MQTT broker IP, port, and entity slug. Check serial monitor for connection status. |
| Garbled text | Verify SPI jumper settings (R19/R23 short, R18/R20 open). |
| WiFi won't connect | Check SSID/password. Ensure ESP32 is in range. |
