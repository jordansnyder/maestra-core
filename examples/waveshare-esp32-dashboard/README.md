# Waveshare ESP32-P4 Touchscreen Dashboard for Maestra

A standalone touchscreen dashboard built with ESP-IDF and LVGL v9 for the [Waveshare ESP32-P4-WIFI6-Touch-LCD-3.4C](https://www.waveshare.com/wiki/ESP32-P4-WIFI6-Touch-LCD-3.4C). Connects to Maestra via MQTT and displays live entity state on an 800×800 round IPS display. Swipe horizontally or tap the navigation dots to cycle between three views.

## Dashboard Views

### 1. Overview

System health at a glance — WiFi/MQTT connection status with colour-coded LEDs, entity count, device uptime, free heap memory, and total activity events.

```
         ╭───────────────────────────╮
       ╱                               ╲
     ╱           OVERVIEW                ╲
    │                                     │
    │   ● WiFi     192.168.1.42 (-52 dBm) │
    │   ● MQTT     Connected               │
    │     Entities 4                        │
    │     Uptime   2h 14m                   │
    │     Free RAM 142 KB                   │
    │     Activity 37 events                │
    │                                       │
    │              ● ○ ○                    │
     ╲                                   ╱
       ╲                               ╱
         ╰───────────────────────────╯
```

### 2. Entities

Real-time state cards for up to 4 subscribed entities in a 2×2 grid. Each card shows the entity slug and its key-value state pairs, updated live as MQTT messages arrive.

```
         ╭───────────────────────────╮
       ╱                               ╲
     ╱           ENTITIES                ╲
    │  ┌──────────────┐ ┌──────────────┐ │
    │  │ rooftop-sdr  │ │ lobby-light  │ │
    │  │ snr_db  24.2 │ │ bright.  75  │ │
    │  │ noise  -42.5 │ │ color #ff00  │ │
    │  └──────────────┘ └──────────────┘ │
    │  ┌──────────────┐ ┌──────────────┐ │
    │  │ temp-sensor  │ │ door-lock    │ │
    │  │ temp.   22.5 │ │ locked  true │ │
    │  │ humid.   61  │ │ battery  87% │ │
    │  └──────────────┘ └──────────────┘ │
    │              ○ ● ○                  │
     ╲                                 ╱
       ╲                             ╱
         ╰─────────────────────────╯
```

### 3. Activity

Scrolling feed of recent entity state changes, most recent first. Shows time elapsed, entity slug, and which keys changed.

```
         ╭───────────────────────────╮
       ╱                               ╲
     ╱           ACTIVITY                ╲
    │                                     │
    │  2s   rooftop-sdr   snr_db, noise   │
    │  5s   lobby-light   brightness      │
    │  12s  rooftop-sdr   peak_power_db   │
    │  30s  temp-sensor   temp, humidity   │
    │  1m   door-lock     locked          │
    │  2m   lobby-light   color, active   │
    │                                     │
    │              ○ ○ ●                  │
     ╲                                 ╱
       ╲                             ╱
         ╰─────────────────────────╯
```

## Hardware

- **Waveshare ESP32-P4-WIFI6-Touch-LCD-3.4C**
  - ESP32-P4 (dual-core RISC-V, 400 MHz, 32 MB PSRAM, 32 MB Flash)
  - 3.4" round IPS display (800×800, MIPI-DSI 2-lane)
  - GT911 capacitive touch (I2C)
  - ESP32-C6 coprocessor for WiFi 6 / BLE 5 (connected via SDIO)
  - USB-C for flashing and power

## Architecture

```
┌───────────────────────────────┐
│  app_main()                   │
│  ├─ NVS init                  │
│  ├─ BSP display + touch init  │  ← bsp_display_start_with_config()
│  ├─ dashboard_ui_create()     │  ← LVGL v9 tileview
│  ├─ wifi_init_sta()           │  ← esp_wifi → ESP32-C6 via SDIO
│  ├─ maestra_mqtt_init()       │  ← ESP-MQTT client
│  └─ LVGL refresh timer (2s)   │
└───────────────────────────────┘
         │ MQTT subscribe
         ▼
  maestra/entity/state/+/<slug>
         │
         ▼
  ┌────────────────────┐
  │ Maestra (Mosquitto) │
  └────────────────────┘
```

The MQTT client subscribes to entity state-change topics and maintains a local cache. The LVGL UI reads from this cache every 2 seconds to update all three views.

## Prerequisites

- **ESP-IDF v5.5+** — [installation guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/get-started/index.html)
- **Waveshare BSP components** — cloned from the [Waveshare ESP32-P4 example repo](https://github.com/waveshareteam/ESP32-P4-WIFI6-Touch-LCD-X)
- A running Maestra stack with entities already created

## Building & Flashing

```bash
cd examples/waveshare-esp32-dashboard

# 1. Copy BSP components from the Waveshare example repository
#    Clone or download: https://github.com/waveshareteam/ESP32-P4-WIFI6-Touch-LCD-X
#    Then copy the required component directories:
mkdir -p components
cp -r /path/to/ESP32-P4-WIFI6-Touch-LCD-X/components/bsp_extra components/
cp -r /path/to/ESP32-P4-WIFI6-Touch-LCD-X/components/esp32_p4_wifi6_touch_lcd_x components/

# 2. Set target to ESP32-P4
idf.py set-target esp32p4

# 3. Configure WiFi, MQTT broker, and entity slugs
idf.py menuconfig
#   → Maestra Dashboard Configuration
#     → WiFi        : set SSID and password
#     → MQTT        : set broker URI (e.g. mqtt://192.168.1.100:1883)
#     → Entities    : set 1–4 entity slugs to subscribe to

# 4. Build, flash, and monitor
idf.py build flash monitor
```

## Configuration

All configuration is done through `idf.py menuconfig` under **Maestra Dashboard Configuration**:

| Setting | Default | Description |
|---------|---------|-------------|
| WiFi SSID | `your-wifi-ssid` | Network to connect to |
| WiFi Password | `your-wifi-password` | Network password |
| WiFi Max Retry | `10` | Connection retry attempts |
| MQTT Broker URI | `mqtt://192.168.1.100:1883` | Maestra Mosquitto broker |
| Entity Slug 1–4 | `entity-one` … `entity-four` | Maestra entity slugs to display |

The entity slugs must match entities that already exist in Maestra. The dashboard subscribes to MQTT state-change events for each slug and updates the display in real time.

## Navigation

| Gesture | Action |
|---------|--------|
| Swipe left | Next view |
| Swipe right | Previous view |
| Navigation dots | Show current position (bottom centre) |

The display uses an LVGL `lv_tileview` with three horizontally arranged tiles. The GT911 capacitive touch controller provides native swipe gestures.

## Project Structure

```
waveshare-esp32-dashboard/
├── CMakeLists.txt            # Top-level build file
├── sdkconfig.defaults        # ESP32-P4 SDK defaults
├── partitions.csv            # Flash partition table (8 MB app, 7 MB storage)
├── README.md
├── components/               # (copied from Waveshare repo, not checked in)
│   ├── bsp_extra/
│   └── esp32_p4_wifi6_touch_lcd_x/
└── main/
    ├── CMakeLists.txt        # Component registration
    ├── Kconfig.projbuild     # Menuconfig options
    ├── idf_component.yml     # IDF Component Manager dependencies
    ├── main.c                # Entry point — WiFi, BSP, MQTT, LVGL init
    ├── maestra_mqtt.c        # MQTT client — subscribe, parse, cache
    ├── maestra_mqtt.h        # Entity/log types and public API
    ├── dashboard_ui.c        # LVGL v9 UI — 3 swipeable pages
    └── dashboard_ui.h        # UI create/refresh API
```

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

**Build fails with missing BSP headers:**
You need to copy the Waveshare BSP components into `components/`. See the build instructions above. The BSP is not distributed as an IDF Component Manager dependency — it must be copied from the [Waveshare example repo](https://github.com/waveshareteam/ESP32-P4-WIFI6-Touch-LCD-X).

**Display is black / no backlight:**
The BSP handles all MIPI-DSI and backlight initialization. Ensure the BSP components were copied correctly and that `sdkconfig.defaults` has the correct ESP32-P4 settings. Try a clean build: `idf.py fullclean && idf.py build`.

**Touch doesn't respond:**
The GT911 touch controller is initialized by the BSP via I2C (GPIO7 SDA, GPIO8 SCL). If touch is unresponsive, check serial output for I2C errors. Some board revisions may have different I2C addresses (0x5D or 0x14).

**WiFi won't connect:**
WiFi runs on the ESP32-C6 coprocessor via SDIO. The standard `esp_wifi` API is transparently proxied by `esp_wifi_remote` + `esp_hosted`. Check that your ESP-IDF version is v5.5+ and that `esp_wifi_remote` and `esp_hosted` components are resolved by the IDF Component Manager.

**MQTT won't connect:**
Confirm the Maestra stack is running (`make ps`) and that the Mosquitto broker is reachable from the ESP32's network. The default Mosquitto config allows anonymous connections on port 1883.

**Entity cards show "awaiting data":**
The dashboard only displays state after receiving at least one MQTT state-change event. Push a state update via the API or another device to trigger it.

**PSRAM not detected / crash on boot:**
Ensure `CONFIG_SPIRAM=y` and `CONFIG_SPIRAM_SPEED_200M=y` are set (they are in `sdkconfig.defaults`). The LVGL frame buffers require PSRAM on the ESP32-P4.
