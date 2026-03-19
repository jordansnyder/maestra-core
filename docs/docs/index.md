# Maestra

Maestra connects all the tools and devices in your creative project so they can talk to each other. A light controlled by TouchDesigner, a sensor on an Arduino, a phone running a web app, a game engine driving visuals — Maestra gives them all a shared language and makes the data flow between them in real time.

## Get started

### Connecting to an existing Maestra?

If someone on your team has already set up Maestra (a technical director, a lead developer, or an IT admin), all you need is the **server address** and your creative tool. Pick your tool and follow the guide:

<div class="grid cards" markdown>

-   **[TouchDesigner](connect/touchdesigner.md)**

    Wire CHOPs and scripts to Maestra entities

-   **[Max/MSP](connect/max-msp.md)**

    Send and receive data over OSC

-   **[Unreal Engine](connect/unreal.md)**

    Blueprint and C++ integration

-   **[Unity](connect/unity.md)**

    MonoBehaviour-based entity control

-   **[Arduino / ESP32](connect/arduino.md)**

    Connect microcontrollers over WiFi

-   **[Web / React / Mobile](connect/web.md)**

    Browser and Node.js apps

-   **[Python](connect/python.md)**

    Scripts, automation, and data pipelines

-   **[Raspberry Pi](connect/raspberry-pi.md)**

    GPIO, sensors, and embedded projects

</div>

### Setting up Maestra for the first time?

If you're the one responsible for getting Maestra running (or you just want to try it on your own machine), head to the [Installation Guide](setup/installation.md). You'll need Docker installed, and the whole setup takes about 5 minutes.

## What can Maestra do?

| Feature | What it means for you |
|---------|----------------------|
| **Shared state** | Any device can read or change any value. Change a color in TouchDesigner, and it updates on every connected phone, Arduino, and game engine instantly. |
| **Works with your tools** | SDKs for TouchDesigner, Max/MSP, Unreal, Unity, Arduino, Python, JavaScript, and more. Each tool connects using the protocol it already speaks. |
| **Live video & data streams** | Share NDI, Syphon, Spout, audio, and sensor streams between devices. Maestra handles discovery — devices find each other automatically. |
| **Signal routing** | Patch outputs to inputs like a virtual patch bay. A sensor drives a light, a slider controls a motor — no custom code needed. |
| **Visual automation** | Node-RED gives you a drag-and-drop canvas for building "if this, then that" logic without writing code. |
| **Dashboard** | A web interface to see everything at a glance — all your devices, entities, and their current state. |
| **DMX lighting** | Control physical lighting fixtures through Art-Net/DMX with the built-in DMX gateway. |
| **Monitoring** | Pre-built Grafana dashboards show device health, message throughput, and state history. |

## How it works (the short version)

```
+---------------------------------------------------------------+
|  YOUR TOOLS                                                   |
|  TouchDesigner | Max/MSP | Unreal | Unity | Arduino | Web    |
+---------------------------------------------------------------+
                              |
                     (OSC, MQTT, WebSocket, HTTP)
                              |
+---------------------------------------------------------------+
|  MAESTRA                                                      |
|  Translates between protocols, stores state, routes messages  |
+---------------------------------------------------------------+
                              |
+---------------------------------------------------------------+
|  EVERY OTHER CONNECTED DEVICE                                 |
+---------------------------------------------------------------+
```

Your tools send data using whatever protocol they already know. Maestra translates, stores, and delivers it to everything else. An Arduino sending a sensor reading over MQTT and a TouchDesigner patch listening over OSC don't need to know anything about each other — Maestra bridges the gap.

## Learn the core concepts

- [Entities & State](concepts/entities.md) — the shared data model at the heart of Maestra
- [Streams](concepts/streams.md) — live video, audio, and data feeds between devices
- [Routing](concepts/routing.md) — automatic signal patching between entities
- [Events & Messages](concepts/events.md) — the messaging system that makes it all work

## Guides

- [Node-RED Automation](guides/nodered.md) — build visual "if this, then that" flows
- [DMX / Art-Net Lighting](guides/dmx-gateway.md) — control physical lighting fixtures
- [Using the Dashboard](guides/dashboard.md) — manage everything from your browser
- [Monitoring & Grafana](guides/monitoring.md) — track system health and performance

## Technical reference

For developers, admins, and anyone who wants the full details:

- [API Reference](api/entities.md) — complete REST API documentation
- [Architecture](architecture/overview.md) — system design and service details
- [SDK Reference](sdks/overview.md) — detailed SDK documentation for every platform

## Getting help

- [GitHub Issues](https://github.com/maestra/maestra-core/issues)
- [API Documentation](http://localhost:8080/docs) (when running locally)
