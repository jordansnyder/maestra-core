# Architecture Overview

Maestra is a microservices-based platform for managing immersive experiences.

## Core Components

### Fleet Manager API

FastAPI-based REST API for entity and device management.

- Entity CRUD operations
- State management with event broadcasting
- Hierarchical entity relationships

### Message Bus

Dual-protocol messaging for maximum compatibility:

- **NATS** - High-performance internal messaging
- **MQTT** - IoT device communication

### Database

- **PostgreSQL** - Primary data store with LTREE for hierarchies
- **TimescaleDB** - Time-series metrics
- **Redis** - Caching and pub/sub

### Gateway Services

- **OSC Gateway** - TouchDesigner, Max/MSP integration
- **WebSocket Gateway** - Browser real-time updates
- **MQTT-NATS Bridge** - Protocol bridging
