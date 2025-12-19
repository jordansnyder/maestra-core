# Maestra Quick Start Guide

Get your Maestra infrastructure running in **5 minutes**.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 8GB RAM minimum

## 🚀 Quick Start (3 Steps)

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

# Or use Makefile (recommended - auto-detects Docker version)
make up
```

### 3. Verify & Access

```bash
# Check service health
make health

# Or manually
curl http://localhost:8080/health
```

**Access Points:**

| Service | URL | Credentials |
|---------|-----|-------------|
| Node-RED | http://localhost:1880 | None |
| Grafana | http://localhost:3000 | admin / admin |
| Dashboard | http://localhost:3001 | None |
| Fleet Manager API | http://localhost:8080/docs | None |
| Portainer | https://localhost:9443 | Setup on first visit |

## 🎯 First Steps

### Connect a Device (MQTT)

**Arduino/ESP32:**

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient client;
PubSubClient mqtt(client);

void setup() {
  mqtt.setServer("YOUR_DOCKER_HOST_IP", 1883);
  mqtt.connect("MyDevice");
  mqtt.publish("maestra/devices/test", "Hello Maestra!");
}
```

**Python:**

```python
import paho.mqtt.client as mqtt

client = mqtt.Client("MyDevice")
client.connect("localhost", 1883, 60)
client.publish("maestra/devices/test", "Hello Maestra!")
```

**Test from Command Line:**

```bash
# Subscribe to all messages
docker compose exec mosquitto mosquitto_sub -t '#' -v

# Or publish test message (recommended)
make test-mqtt
```

### Create Your First Flow (Node-RED)

1. Open http://localhost:1880
2. Drag an **MQTT In** node
3. Configure:
   - Server: `mosquitto:1883`
   - Topic: `maestra/devices/#`
4. Add a **Debug** node
5. Connect them and **Deploy**
6. Publish MQTT message (see above)
7. See output in Debug panel!

### Register a Device (REST API)

```bash
curl -X POST http://localhost:8080/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Arduino",
    "device_type": "arduino",
    "hardware_id": "ESP32-001",
    "firmware_version": "1.0.0"
  }'
```

### Send OSC from TouchDesigner/Max

**TouchDesigner:**
- Add `OSC Out DAT`
- Network Address: `YOUR_DOCKER_HOST_IP`
- Network Port: `57120`
- Send message: `/device/sensor/temperature 23.5`

**Max/MSP:**
```
[udpsend YOUR_DOCKER_HOST_IP 57120]
```

### WebSocket (Browser)

```html
<script>
const ws = new WebSocket('ws://localhost:8765');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'publish',
    subject: 'maestra.web.test',
    data: { hello: 'world' }
  }));
};

ws.onmessage = (e) => {
  console.log('Received:', JSON.parse(e.data));
};
</script>
```

## 📊 View Your Data

### Grafana Dashboards

1. Go to http://localhost:3000
2. Login: `admin` / `admin`
3. Navigate to **Dashboards** → **Maestra** → **Device Overview**
4. See real-time device metrics and events

### Database Queries

```bash
# Access PostgreSQL
make shell-postgres

# List all devices
SELECT * FROM devices;

# View recent events
SELECT * FROM device_events ORDER BY time DESC LIMIT 10;

# Device metrics
SELECT * FROM device_metrics_hourly WHERE device_id = 'YOUR_DEVICE_ID';
```

## 🛠️ Common Commands

```bash
make up          # Start all services
make down        # Stop all services
make logs        # View all logs
make ps          # Show service status
make health      # Check service health
make restart     # Restart all services
```

## 🆘 Troubleshooting

### Services Won't Start

```bash
# Check logs
make logs

# Check specific service
make logs-service SERVICE=fleet-manager

# Restart everything
make restart
```

### Port Already in Use

Edit `docker-compose.yml` and change the host port:

```yaml
ports:
  - "8081:8080"  # Changed from 8080:8080
```

Or use the Makefile commands which handle this automatically.

### Clear Everything

```bash
# Stop and remove (keeps data)
make clean

# Remove everything including data (⚠️  WARNING)
make clean-all
```

## 📚 Next Steps

- Read the full [Docker Infrastructure Guide](DOCKER.md)
- Explore [SDK Integration Examples](DOCKER.md#sdk-integration)
- Check out [Node-RED flows](flows/)
- Read [Production Deployment](DOCKER.md#production-deployment)

## 🎨 Example Projects

### 1. Temperature Monitor

**Hardware:** ESP32 + DHT22 sensor

**Flow:**
1. ESP32 sends MQTT: `maestra/sensors/temp` → `{"value": 23.5}`
2. Node-RED receives, stores in database
3. Grafana displays real-time graph
4. Alert if > 30°C

**Code:**
```cpp
// ESP32
mqtt.publish("maestra/sensors/temp",
  String("{\"value\":" + String(temperature) + "}").c_str());
```

### 2. Interactive Installation

**Hardware:** Raspberry Pi + TouchDesigner

**Flow:**
1. TouchDesigner sends OSC motion data to gateway
2. Gateway publishes to NATS
3. Node-RED processes and triggers responses
4. Multiple devices react in sync

### 3. Multi-Device Show Control

**Devices:** 5x Arduino + Unreal Engine

**Flow:**
1. Dashboard sends "START" command
2. Fleet Manager deploys configuration to all devices
3. Node-RED orchestrates timing
4. Devices execute synchronized light show

## 💡 Tips

- Start with `make dev-core` for minimal services during development
- Use `make watch` to monitor service status
- Check `make health` regularly
- Backup database with `make backup-db`

---

**Ready to build something amazing? Let's go! 🚀**

For detailed documentation, see [DOCKER.md](DOCKER.md)
