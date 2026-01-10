# Maestra Platform

Welcome to the Maestra documentation. Maestra is an immersive experience platform for managing IoT devices, creative tools, and real-time state synchronization.

## Features

- **Entity Management** - Hierarchical entities with persistent JSON state
- **Real-time Events** - State changes broadcast via NATS and MQTT
- **Multi-Platform SDKs** - Python, JavaScript, Arduino, TouchDesigner, Max/MSP, Unreal Engine, Unity
- **Visual Programming** - Node-RED integration for automation flows
- **Monitoring** - Grafana dashboards and TimescaleDB metrics

## Quick Links

- [Installation Guide](getting-started/installation.md)
- [Quick Start](getting-started/quickstart.md)
- [API Reference](api/fleet-manager.md)
- [SDK Documentation](sdks/overview.md)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SDKs: Python │ JS/TS │ Arduino │ TD │ Max │ UE │ Unity   │
└─────────────────────────────────────────────────────────────┘
                    │ REST API │ NATS │ MQTT │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Fleet Manager API (FastAPI)                                │
│  - Entity CRUD: /entities, /entities/{id}                   │
│  - State Management: /entities/{id}/state                   │
│  - Hierarchy: /entities/{id}/ancestors, /descendants        │
└─────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  PostgreSQL   │       │  NATS + MQTT  │
│  + TimescaleDB│       │  (events)     │
└───────────────┘       └───────────────┘
```

## Getting Help

- [GitHub Issues](https://github.com/maestra/maestra-core/issues)
- [API Documentation](http://localhost:8080/docs) (when running locally)
