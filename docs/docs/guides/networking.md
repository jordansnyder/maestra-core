# Networking Best Practices

Practical networking guidance for Maestra installations. These recommendations come from real-world deployments in galleries, theaters, and live performance venues.

## Use Ethernet Whenever Possible

The Maestra server and any device that stays in one place should be on a wired Ethernet connection. This includes:

- The machine running the Maestra Docker stack
- TouchDesigner / Unreal Engine workstations
- Art-Net / DMX nodes
- Raspberry Pi installations
- Any device that doesn't physically move during a show

WiFi is fine for devices that need to be portable: phones, tablets, wireless sensors, and roaming performers. Everything else should be wired.

**Why it matters**: Ethernet gives you consistent sub-millisecond latency with zero contention. WiFi latency is unpredictable and gets worse as you add devices. For a live show, predictable beats fast.

## Dedicated WiFi Network

If you have wireless Maestra clients, set up a **dedicated 5 GHz WiFi SSID** just for them. Do not share the same network with audience phones, venue WiFi, or general internet traffic.

Recommended setup:

| Network | Band | Purpose |
|---------|------|---------|
| `maestra-devices` | 5 GHz | Maestra wireless clients only |
| `venue-public` | 2.4 GHz | Audience phones, general internet |

A basic access point (Ubiquiti, TP-Link, etc.) connected to the same Ethernet switch as your Maestra server works well. Keep the channel width at 40 MHz for a good balance of speed and reliability.

!!! tip
    If your venue already has enterprise WiFi (Ubiquiti UniFi, Cisco Meraki, etc.), create a separate VLAN and SSID for Maestra rather than sharing the existing one.

## Why WiFi Gets Flaky With Many Devices

WiFi uses a collision avoidance mechanism called CSMA/CA. In simple terms: only one device can transmit at a time on a given channel. Every device has to listen, wait for silence, then send. If two devices transmit simultaneously, both back off and retry after a random delay.

With 2-3 devices this works fine. With 10+ devices on the same channel, they constantly compete for airtime. The result is **latency spikes** even when total bandwidth usage is low. You might only be pushing 100 KB/sec of data, well within WiFi capacity, but individual messages can get delayed 50-200 ms while devices take turns.

This is the single biggest source of "it worked in the studio but not at the venue" problems. More devices on the same channel always makes it worse, regardless of bandwidth.

**Mitigations**:

- Use Ethernet for everything you can
- Keep wireless Maestra clients on their own dedicated channel
- Prefer 5 GHz (more available channels, less congestion from other networks)
- Keep the device count per channel under 10 if latency matters

## Protocol Selection Guide

Maestra supports multiple protocols. Choose based on your device and latency requirements.

### OSC (UDP)

**Best for**: TouchDesigner, Max/MSP, SuperCollider, creative coding tools

| Property | Value |
|----------|-------|
| Transport | UDP |
| Latency | Lowest (~1 ms on Ethernet) |
| Delivery guarantee | None (fire-and-forget) |
| Port | 57120 (in), 57121 (out) |

OSC is the fastest option. Messages go out immediately with no handshake or acknowledgment overhead. The tradeoff is that packets can be lost, though on a local Ethernet network this almost never happens. On WiFi, occasional drops are possible under congestion.

Use OSC when frame-accurate timing matters more than guaranteed delivery.

### MQTT (TCP)

**Best for**: Arduino, ESP32, Raspberry Pi, IoT sensors

| Property | Value |
|----------|-------|
| Transport | TCP |
| Latency | Low (~2-5 ms on Ethernet) |
| Delivery guarantee | QoS 0 (none), QoS 1 (at least once), QoS 2 (exactly once) |
| Port | 1883 (TCP), 9001 (WebSocket) |

MQTT adds TCP reliability on top of a lightweight pub/sub model. QoS 1 is the sweet spot for most Maestra use cases: messages are retried until acknowledged, but without the overhead of QoS 2. Arduino and ESP32 libraries have excellent MQTT support.

Use MQTT for devices where you need reliable delivery and the extra few milliseconds of latency don't matter.

See the [MQTT Integration Guide](mqtt.md) for connection details and code examples.

### WebSocket (TCP)

**Best for**: Dashboard, web apps, mobile browsers

| Property | Value |
|----------|-------|
| Transport | TCP + HTTP upgrade |
| Latency | Low-moderate (~5-10 ms) |
| Delivery guarantee | TCP reliable delivery |
| Port | 8765 |

WebSocket is the only option for browser-based clients. It carries more per-message overhead than OSC or MQTT (HTTP framing, JSON encoding), but this is negligible for typical dashboard update rates.

Use WebSocket for anything that runs in a browser.

### Quick Comparison

| | OSC | MQTT | WebSocket |
|---|-----|------|-----------|
| Latency | Lowest | Low | Moderate |
| Reliability | None | Configurable | TCP |
| Browser support | No | Via WS adapter | Native |
| Best for | Creative tools | IoT devices | Web apps |
| Bandwidth overhead | Minimal | Low | Moderate |

## Bandwidth Estimates

Maestra messages are small. A typical entity state update is around 200-500 bytes of JSON. Here is what to expect at common scales:

| Entities | Update rate | Messages/sec | Bandwidth per client |
|----------|------------|--------------|---------------------|
| 10 | 10 Hz | 100 | ~50 KB/sec |
| 20 | 10 Hz | 200 | ~100 KB/sec |
| 50 | 10 Hz | 500 | ~250 KB/sec |
| 50 | 30 Hz | 1,500 | ~750 KB/sec |

For context, 100 KB/sec is about 0.1% of a 100 Mbps Ethernet link. Even the 50-entity, 30 Hz scenario uses less than 1% of available bandwidth. Network bandwidth is almost never the bottleneck. Contention (WiFi) and processing latency are what to watch.

!!! note
    These estimates are per subscribing client. If you have 5 WebSocket dashboards open, multiply by 5 for total outbound traffic from the WebSocket gateway. NATS handles this fan-out efficiently.

## Network Topology

Here is a recommended physical layout for a typical Maestra installation:

```
                    ┌──────────────────────┐
                    │   Ethernet Switch    │
                    │   (Gigabit, unmanaged │
                    │    is fine)           │
                    └──┬───┬───┬───┬───┬───┘
                       │   │   │   │   │
          ┌────────────┘   │   │   │   └────────────┐
          │                │   │   │                 │
          ▼                ▼   │   ▼                 ▼
    ┌───────────┐  ┌─────────┐│ ┌──────────┐  ┌───────────┐
    │  Maestra  │  │ Touch-  ││ │ Art-Net  │  │  WiFi AP  │
    │  Server   │  │ Designer││ │ DMX Node │  │  (5 GHz)  │
    │  (Docker) │  │ Worksta.││ │          │  │           │
    └───────────┘  └─────────┘│ └──────────┘  └─────┬─────┘
                              │                     │
                              ▼               ┌─────┴─────┐
                        ┌──────────┐          │  Wireless  │
                        │ Raspberry│          │  Devices   │
                        │ Pi       │          │            │
                        └──────────┘          │ - Phones   │
                                              │ - Tablets  │
                                              │ - Sensors  │
                                              └────────────┘
```

**Key points**:

- Everything wired connects to the same switch. One hop, no routing.
- The WiFi access point connects to the switch via Ethernet, so wireless clients are on the same Layer 2 network as wired devices.
- No internet connection is required. Maestra runs entirely on the local network.
- For larger installations, a managed switch with VLANs can isolate Maestra traffic from other venue systems.

## Checklist

Before your show or installation goes live:

- [ ] Maestra server is on Ethernet
- [ ] All fixed-position devices are on Ethernet
- [ ] Wireless Maestra clients have a dedicated 5 GHz SSID
- [ ] Audience/public WiFi is on a separate network
- [ ] Tested with all devices connected simultaneously
- [ ] Verified latency under load (the Console visualization's ambient view shows message flow in real time)
- [ ] Firewall allows required ports (see [Port Reference](../architecture/services.md) or `CLAUDE.md`)
