# Quick Start Guide

Get your Maestra infrastructure running in 5 minutes.

## Prerequisites

- Docker 20.10+
- Docker Compose V2
- 8GB RAM minimum
- Ports available: 80, 1883, 3000, 3001, 4222, 5432, 8080

## Installation

### 1. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Or use Makefile
make init
```

### 2. Start Infrastructure

```bash
# Start all services
docker compose up -d

# Or use Makefile (recommended)
make up
```

### 3. Verify Services

```bash
# Check health
make health

# Or manually
curl http://localhost:8080/health
```

## Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Dashboard** | http://localhost:3001 | None |
| **Node-RED** | http://localhost:1880 | None |
| **Grafana** | http://localhost:3000 | admin / admin |
| **Fleet Manager API** | http://localhost:8080/docs | None |
| **Portainer** | https://localhost:9443 | Setup on first visit |

## First Steps

### Register Your First Device

1. Open the Dashboard: http://localhost:3001
2. Click **"+ Register Device"**
3. Fill in device details:
   - **Name**: My Arduino
   - **Type**: arduino
   - **Hardware ID**: AA:BB:CC:DD:EE:FF
4. Click **"Register Device"**

### Connect a Device

**Arduino/ESP32 (MQTT):**
```cpp
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient client;
PubSubClient mqtt(client);

void setup() {
  mqtt.setServer("YOUR_DOCKER_HOST_IP", 1883);
  mqtt.connect("MyDevice");
  mqtt.publish("maestra/devices/test", "Hello!");
}
```

**Python (MQTT):**
```python
import paho.mqtt.client as mqtt

client = mqtt.Client("MyDevice")
client.connect("localhost", 1883, 60)
client.publish("maestra/devices/test", "Hello!")
```

### Create Your First Flow

1. Open Node-RED: http://localhost:1880
2. Drag **MQTT In** node to canvas
3. Configure:
   - Server: `mosquitto:1883`
   - Topic: `maestra/devices/#`
4. Add **Debug** node
5. Connect nodes and click **Deploy**
6. Publish MQTT message (see above)
7. View output in Debug panel!

## Useful Commands

```bash
make up          # Start all services
make down        # Stop all services
make logs        # View all logs
make ps          # Show service status
make health      # Check service health
make restart     # Restart all services
```

## Troubleshooting

### Services Won't Start

```bash
# Check logs
make logs

# Check specific service
make logs-service SERVICE=dashboard

# Restart everything
make restart
```

### Port Already in Use

Edit `docker-compose.yml`:
```yaml
ports:
  - "8081:8080"  # Changed from 8080:8080
```

### Clear Everything

```bash
# Stop and remove (keeps data)
make clean

# Remove everything including data (⚠️ WARNING)
make clean-all
```

## Next Steps

- [Register more devices](../guides/device-registration.md)
- [Explore MQTT messaging](../guides/mqtt.md)
- [Create Node-RED flows](../guides/nodered.md)
- [View SDK integration](../sdks/overview.md)

---

**Ready to build! 🚀**
