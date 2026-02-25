# Waveshare ESP32-S3 Touchscreen Dashboard for Maestra

A standalone touchscreen dashboard that connects to Maestra via MQTT and displays live entity state. Tap the bottom navigation bar or the left/right edges of the screen to cycle between three views.

## Dashboard Views

### 1. Overview

System health at a glance:

```
┌──────────────────────────────────────────────┐
│  MAESTRA         OVERVIEW          [●] [●]   │  ← WiFi & MQTT dots
├──────────────────────────────────────────────┤
│  WiFi        192.168.1.42 (-52 dBm)         │
│  MQTT        Connected                       │
│  Entities    4                                │
│  Uptime      2h 14m                           │
│  Free RAM    142 KB                           │
│  Activity    37 events                        │
├──────────────────────────────────────────────┤
│  [ OVERVIEW ]   ENTITIES     ACTIVITY        │
└──────────────────────────────────────────────┘
```

### 2. Entities

Real-time state cards for up to 4 subscribed entities in a 2x2 grid. Each card shows the entity slug and its most recent state values, updated live as MQTT messages arrive.

```
┌──────────────────────────────────────────────┐
│  MAESTRA         ENTITIES          [●] [●]   │
├──────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ rooftop-sdr     │  │ lobby-light     │   │
│  │ snr_db    24.2  │  │ brightness  75  │   │
│  │ noise    -42.5  │  │ color   #ff00a0 │   │
│  │ freq_mhz 100.0  │  │ active    true  │   │
│  └─────────────────┘  └─────────────────┘   │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ temp-sensor-1   │  │ door-lock-main  │   │
│  │ temperature 22  │  │ locked    true  │   │
│  │ humidity    61  │  │ battery    87%  │   │
│  │ awaiting data   │  │ awaiting data   │   │
│  └─────────────────┘  └─────────────────┘   │
├──────────────────────────────────────────────┤
│    OVERVIEW   [ ENTITIES ]   ACTIVITY        │
└──────────────────────────────────────────────┘
```

### 3. Activity

Scrolling feed of recent entity state changes, most recent first. Shows how long ago the change occurred, which entity changed, and which keys were updated.

```
┌──────────────────────────────────────────────┐
│  MAESTRA         ACTIVITY          [●] [●]   │
├──────────────────────────────────────────────┤
│  2s   rooftop-sdr      snr_db, noise_floor   │
│  5s   lobby-light      brightness             │
│  12s  rooftop-sdr      peak_power_db          │
│  30s  temp-sensor-1    temperature, humidity   │
│  1m   door-lock-main   locked                 │
│  2m   lobby-light      color, active           │
│  5m   rooftop-sdr      center_frequency_mhz   │
│                                                │
├──────────────────────────────────────────────┤
│    OVERVIEW     ENTITIES   [ ACTIVITY ]      │
└──────────────────────────────────────────────┘
```

## Hardware

- **Waveshare ESP32-S3 3.5" Touch LCD** (480x320, ILI9488 display, FT6336U capacitive touch)
- USB-C cable for flashing and power

Other Waveshare ESP32 touch displays (4.3", 7", etc.) will also work with adjusted pin definitions and resolution constants in the sketch.

## Pin Mapping

Default pin definitions for the Waveshare ESP32-S3 3.5" LCD. These are set as build flags in `platformio.ini` and as `#define`s in the sketch for the touch controller. Verify against your specific board revision — Waveshare has shipped multiple hardware versions.

| Function | GPIO | Notes |
|----------|------|-------|
| TFT_MOSI | 11 | SPI data out |
| TFT_SCLK | 12 | SPI clock |
| TFT_MISO | 13 | SPI data in |
| TFT_CS | 15 | Display chip select |
| TFT_DC | 4 | Data/command |
| TFT_RST | 5 | Display reset |
| TFT_BL | 45 | Backlight PWM |
| TOUCH_SDA | 7 | I2C data (FT6336U) |
| TOUCH_SCL | 8 | I2C clock |
| TOUCH_INT | 3 | Touch interrupt |
| TOUCH_RST | 2 | Touch reset |

If your board uses different pins (check the silkscreen or Waveshare wiki), update the `build_flags` in `platformio.ini` for display pins and the `#define` block at the top of the sketch for touch pins.

## Building & Flashing

### PlatformIO (recommended)

```bash
cd examples/waveshare-esp32-dashboard

# Install the Maestra Arduino SDK as a local library
mkdir -p lib
cp -r ../../sdks/arduino/MaestraClient lib/

# Build and upload
pio run -t upload

# Monitor serial output
pio device monitor
```

### Arduino IDE

1. Install board support: **ESP32** by Espressif (Board Manager)
2. Install libraries via Library Manager:
   - **TFT_eSPI** by Bodmer
   - **FT6336U** by rkoptev
   - **PubSubClient** by Nick O'Leary
   - **ArduinoJson** by Benoit Blanchon (v7+)
3. Copy `sdks/arduino/MaestraClient/src/` files into your Arduino libraries folder
4. **Important:** Configure TFT_eSPI for your display. Edit the file `Arduino/libraries/TFT_eSPI/User_Setup.h`:

```cpp
#define ILI9488_DRIVER
#define TFT_WIDTH  320
#define TFT_HEIGHT 480
#define TFT_MOSI   11
#define TFT_SCLK   12
#define TFT_MISO   13
#define TFT_CS     15
#define TFT_DC      4
#define TFT_RST     5
#define TFT_BL     45
#define SPI_FREQUENCY       40000000
#define SPI_READ_FREQUENCY  16000000
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_GFXFF
#define SMOOTH_FONT
```

5. Select board: **ESP32S3 Dev Module**
6. Open `waveshare_dashboard.ino`, edit the configuration section at the top, and upload.

## Configuration

Edit the constants at the top of `waveshare_dashboard.ino`:

```cpp
// WiFi
const char* WIFI_SSID     = "your-wifi-ssid";
const char* WIFI_PASSWORD = "your-wifi-password";

// Maestra host
const char* MQTT_HOST = "192.168.1.100";
const int   MQTT_PORT = 1883;

// Entities to display (up to 4)
const char* ENTITY_SLUGS[] = {
  "rooftop-sdr",
  "lobby-light",
  "temp-sensor-1",
  "door-lock-main",
};
```

The entity slugs must match entities that already exist in Maestra. The dashboard subscribes to MQTT state-change events for each slug and updates the display in real time.

## Touch Navigation

| Gesture | Action |
|---------|--------|
| Tap bottom nav bar | Switch directly to that view |
| Tap left edge (<60px) | Previous view |
| Tap right edge (>420px) | Next view |

## Maestra Setup

The dashboard is read-only — it subscribes to entity state changes but doesn't modify anything. You need entities already created in Maestra for it to display.

Create test entities if you don't have any yet:

```bash
# Create an entity type
curl -X POST http://localhost:8080/entities/types \
  -H 'Content-Type: application/json' \
  -d '{"name": "sensor", "display_name": "Sensor", "default_state": {}}'

# Create entities (use the type ID from above)
curl -X POST http://localhost:8080/entities \
  -H 'Content-Type: application/json' \
  -d '{"name": "Rooftop SDR", "entity_type_id": "<TYPE_ID>", "slug": "rooftop-sdr"}'

# Push some test state
curl -X PATCH http://localhost:8080/entities/<ENTITY_ID>/state \
  -H 'Content-Type: application/json' \
  -d '{"state": {"temperature": 22.5, "humidity": 61, "status": "online"}, "source": "test"}'
```

State changes from any source (API, other MQTT devices, Node-RED flows, OSC gateway) will appear on the dashboard in real time.

## Pairing with the RTL-SDR Example

This dashboard pairs well with the [RTL-SDR example](../rtl-sdr/). Set one of the entity slugs to the same slug used by the RTL-SDR script, and the Entities view will show live signal metrics (SNR, noise floor, peak frequency) updating in real time. The Activity view will log every state change as it arrives.

## Troubleshooting

**Display is white/blank:**
Pin mapping doesn't match your board. Check the Waveshare wiki for your exact model and update the TFT_eSPI build flags in `platformio.ini`.

**Touch doesn't respond:**
Verify `TOUCH_SDA` / `TOUCH_SCL` / `TOUCH_INT` / `TOUCH_RST` match your board. Try swapping SDA and SCL. Some board revisions use GT911 instead of FT6336U — install the appropriate library.

**MQTT won't connect:**
Confirm the Maestra stack is running (`make ps`) and that the Mosquitto broker is reachable from the ESP32's network. The default Mosquitto config allows anonymous connections on port 1883.

**Entity cards show "awaiting data":**
The dashboard only displays state after receiving at least one MQTT state-change event. Push a state update via the API or another device to trigger it.
