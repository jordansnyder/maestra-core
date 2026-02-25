# RTL-SDR Spectrum Analyzer → Maestra

Reads radio spectrum from an [RTL-SDR](https://www.rtl-sdr.com/) USB dongle on a Raspberry Pi and pushes the data into Maestra at two different rates:

| Channel | Rate | What | How |
|---------|------|------|-----|
| **Entity state** | ~1 Hz | Tuner config, signal summary (noise floor, peak, SNR), device health | `PATCH /entities/{id}/state` |
| **Spectrum stream** | ~20 Hz | Full FFT power-spectrum array (1024 float32 bins) | UDP binary packets via Maestra Streams |
| **Metrics** | ~0.1 Hz | SNR, noise floor, peak power, CPU temp | `POST /metrics/batch` (→ TimescaleDB) |
| **Events** | on change | Strong signal detected, errors | `POST /events` |

This split keeps the entity state clean for dashboards and Node-RED flows, while the high-bandwidth spectrum data goes over a dedicated UDP stream that TouchDesigner, Max/MSP, or a custom visualizer can consume directly.

## Hardware

- **Raspberry Pi** (3B+ or newer recommended)
- **RTL-SDR dongle** — any RTL2832U-based stick (e.g. RTL-SDR Blog V3/V4, NooElec NESDR)
- USB-A cable or OTG adapter

## Prerequisites

1. **RTL-SDR driver** — install `librtlsdr` on the Pi:

```bash
sudo apt-get update
sudo apt-get install -y librtlsdr-dev
```

2. **Blacklist the default DVB-T kernel module** (so librtlsdr can claim the device):

```bash
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtlsdr.conf
sudo modprobe -r dvb_usb_rtl28xxu   # unload if currently loaded
```

3. **Python dependencies**:

```bash
cd examples/rtl-sdr
pip install -r requirements.txt
```

## Maestra Setup

Before running the script you need an entity to write state into. Create one via the Fleet Manager API or the dashboard:

```bash
# 1. Create an entity type (skip if you already have a "sensor" type)
curl -X POST http://localhost:8080/entities/types \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "sdr-receiver",
    "display_name": "SDR Receiver",
    "description": "Software-defined radio receiver",
    "icon": "radio",
    "default_state": {
      "status": "offline",
      "center_frequency_hz": 0,
      "sample_rate_hz": 0,
      "gain": 0,
      "noise_floor_db": null,
      "peak_power_db": null,
      "peak_frequency_hz": null,
      "snr_db": null
    }
  }'

# 2. Create an entity (use the type ID from step 1)
curl -X POST http://localhost:8080/entities \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Rooftop SDR",
    "entity_type_id": "<TYPE_ID>",
    "slug": "rooftop-sdr",
    "description": "RTL-SDR on the roof for spectrum monitoring",
    "tags": ["sdr", "rf", "rooftop"]
  }'
```

## Usage

### Basic — entity state + metrics only

```bash
python rtl_sdr_maestra.py --entity-slug rooftop-sdr
```

The script will:
1. Register the RTL-SDR as a Maestra device
2. Tune to 100 MHz (default), auto-gain
3. Update entity state at ~1 Hz with signal summary
4. Submit metrics to TimescaleDB every ~10 s
5. Send heartbeats every ~15 s

### Custom tuning

```bash
# 433 MHz ISM band, manual gain
python rtl_sdr_maestra.py \
  --entity-slug rooftop-sdr \
  -f 433.92e6 \
  -g 40

# ADS-B aircraft transponders at 1090 MHz
python rtl_sdr_maestra.py \
  --entity-slug rooftop-sdr \
  -f 1090e6 \
  -g 49.6 \
  --fft-size 2048
```

### With spectrum streaming

Advertise a Maestra stream so other devices can discover and consume the live spectrum:

```bash
python rtl_sdr_maestra.py \
  --entity-slug rooftop-sdr \
  --stream \
  --stream-port 9900
```

Or send directly to a known consumer (e.g. a TouchDesigner machine):

```bash
python rtl_sdr_maestra.py \
  --entity-slug rooftop-sdr \
  --stream \
  --stream-dest 192.168.1.50:9900
```

### Signal detection events

Emit a Maestra event when a signal exceeds an SNR threshold:

```bash
python rtl_sdr_maestra.py \
  --entity-slug rooftop-sdr \
  -f 100e6 \
  --signal-threshold 20
```

## CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--entity-slug` | *(required)* | Maestra entity slug to update |
| `--api-url` | `http://localhost:8080` | Fleet Manager API URL |
| `--nats-url` | *(none)* | NATS URL for real-time subscriptions |
| `-f`, `--frequency` | `100e6` | Center frequency in Hz |
| `-s`, `--sample-rate` | `2.048e6` | Sample rate in Hz |
| `-g`, `--gain` | `0` (auto) | Tuner gain in dB (0 = auto) |
| `--fft-size` | `1024` | FFT bins (must be power of 2, >= 64) |
| `--interval` | `0.05` | Min seconds between FFT cycles |
| `--stream` | off | Advertise a Maestra spectrum stream |
| `--stream-port` | `9900` | UDP port for the spectrum stream |
| `--stream-dest` | *(none)* | Direct UDP `host:port` destination |
| `--signal-threshold` | *(none)* | SNR in dB to trigger detection events |

## UDP Packet Format

When streaming is enabled, each FFT frame is sent as a binary UDP packet:

```
Offset  Size     Type      Field
──────  ───────  ────────  ──────────────────────
0       4        uint32    Magic (0x53445246 = "SDRF")
4       4        uint32    Sequence number
8       8        float64   Center frequency (Hz)
16      8        float64   Sample rate (Hz)
24      8        float64   Reserved (0)
32      4        uint32    FFT size (number of bins)
36      N×4      float32[] Power values in dBFS
```

With the default 1024-bin FFT, each packet is **36 + 4096 = 4132 bytes** — well under the typical 1500-byte MTU when using jumbo frames, or easily fits in a single UDP datagram on a LAN.

### Reading packets in Python (consumer side)

```python
import struct
import numpy as np
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", 9900))

while True:
    data, addr = sock.recvfrom(65536)
    magic, seq = struct.unpack_from("<II", data, 0)
    center_freq, sample_rate, _ = struct.unpack_from("<ddd", data, 8)
    fft_size = struct.unpack_from("<I", data, 32)[0]
    power_db = np.frombuffer(data, dtype=np.float32, offset=36, count=fft_size)
    print(f"[{seq}] {center_freq/1e6:.3f} MHz, {fft_size} bins, peak={power_db.max():.1f} dBFS")
```

## Entity State Schema

The script maintains the following state on the Maestra entity:

```json
{
  "status": "running",
  "center_frequency_hz": 100000000,
  "center_frequency_mhz": 100.0,
  "sample_rate_hz": 2048000,
  "gain": 0,
  "gain_mode": "auto",
  "fft_size": 1024,
  "noise_floor_db": -42.5,
  "peak_power_db": -18.3,
  "peak_frequency_hz": 99700000,
  "snr_db": 24.2,
  "device_id": "uuid-...",
  "hardware_id": "rtlsdr-...",
  "ip_address": "192.168.1.30",
  "cpu_temp_c": 52.1,
  "streaming": true
}
```

Other Maestra clients (Node-RED, dashboard, TouchDesigner) can subscribe to state changes on this entity to react to signal conditions in real time.

## Running as a Service

To run on boot:

```bash
sudo tee /etc/systemd/system/maestra-sdr.service > /dev/null <<EOF
[Unit]
Description=Maestra RTL-SDR Spectrum Analyzer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/maestra-core/examples/rtl-sdr
ExecStart=/usr/bin/python3 rtl_sdr_maestra.py --entity-slug rooftop-sdr --stream -f 433.92e6
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable maestra-sdr
sudo systemctl start maestra-sdr
```
