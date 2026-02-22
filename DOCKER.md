# Maestra Docker Infrastructure

Complete Docker Compose setup for the Maestra immersive experience platform.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Services](#services)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [SDK Integration](#sdk-integration)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

The Maestra infrastructure consists of several layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  TouchDesigner │ Max/MSP │ Unreal │ Arduino │ Web │ Mobile  │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GATEWAY LAYER                            │
│    OSC Gateway  │  WebSocket Gateway  │  MQTT (Mosquitto)  │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  MESSAGE BUS LAYER                          │
│         NATS (Pub/Sub) │ Redis (Cache/State)               │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                             │
│  Fleet Manager │ Node-RED Logic │ Dashboard │ Grafana       │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PERSISTENCE LAYER                         │
│             PostgreSQL (TimescaleDB)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Services

### Message Bus & Communication

#### **NATS** (Port 4222, 8222)
- Primary message bus for service-to-service communication
- JetStream enabled for message persistence
- Monitoring UI: http://localhost:8222

#### **Mosquitto** (Port 1883, 9001)
- MQTT broker for IoT devices (Arduino, ESP32, Raspberry Pi)
- WebSocket support on port 9001 for browser clients
- Optimized for device telemetry and control

#### **Redis** (Port 6379)
- Caching layer
- Real-time data storage
- Pub/sub for fast messaging
- Session storage

### Database

#### **PostgreSQL with TimescaleDB** (Port 5432)
- Device registry and fleet management
- Time-series metrics and telemetry
- Event logging
- User authentication
- Continuous aggregates for analytics

### Visual Programming & Logic

#### **Node-RED** (Port 1880)
- Visual flow-based programming
- Pre-configured for NATS, MQTT, Redis
- Custom Maestra nodes and settings
- Flow storage and versioning
- Editor: http://localhost:1880

### Web Dashboards

#### **Maestra Dashboard** (Port 3001)
- Next.js-based control panel
- Real-time device monitoring
- Configuration management
- Experience deployment
- URL: http://localhost:3001

#### **Grafana** (Port 3000)
- Real-time monitoring and analytics
- Pre-configured dashboards
- PostgreSQL and Redis datasources
- Login: admin / admin (change in production)
- URL: http://localhost:3000

### Infrastructure Management

#### **Traefik** (Port 80, 443, 8081)
- Reverse proxy and load balancer
- Automatic service discovery
- Dashboard: http://localhost:8081

#### **Portainer** (Port 9000, 9443)
- Docker container management UI
- Volume and network management
- Container logs and stats
- URL: https://localhost:9443

### Gateway Services

#### **OSC Gateway** (Port 57120/UDP, 57121/UDP)
- Bridges OSC to NATS/MQTT
- For TouchDesigner, Max/MSP, SuperCollider
- Bi-directional message routing

#### **WebSocket Gateway** (Port 8765)
- Browser-based SDK support
- Real-time web application connectivity
- NATS message bridge

### Fleet Management

#### **Fleet Manager API** (Port 8080)
- Device registration and management
- Configuration deployment
- Metrics collection
- REST API: http://localhost:8080
- API Docs: http://localhost:8080/docs

### Documentation

#### **MkDocs** (Port 8000)
- SDK documentation
- API references
- Integration guides
- URL: http://localhost:8000

---

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 8GB+ RAM recommended
- Ports 80, 443, 1883, 3000, 3001, 4222, 5432, 8080 available

### 1. Clone and Setup

```bash
git clone <repository-url>
cd maestra-core

# Copy environment configuration
cp .env.example .env

# Edit .env and update passwords for production
nano .env
```

### 2. Start Infrastructure

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check service health
docker compose ps
```

> **Note:** The Makefile auto-detects whether you have `docker compose` (V1) or `docker compose` (V2) installed.

### 3. Verify Services

```bash
# Check all services are healthy
curl http://localhost:8080/health  # Fleet Manager
curl http://localhost:8222         # NATS monitoring
curl http://localhost:3000         # Grafana
curl http://localhost:1880         # Node-RED
```

### 4. Access Dashboards

- **Node-RED**: http://localhost:1880
- **Grafana**: http://localhost:3000 (admin/admin)
- **Maestra Dashboard**: http://localhost:3001
- **Fleet Manager API**: http://localhost:8080/docs
- **Portainer**: https://localhost:9443
- **Traefik**: http://localhost:8081

---

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Grafana
GRAFANA_PASSWORD=your_admin_password

# Security (generate random strings)
JWT_SECRET=your_jwt_secret_key
```

### Service-Specific Configuration

#### Mosquitto MQTT

Edit `config/mosquitto/mosquitto.conf`:

```conf
# Enable authentication for production
allow_anonymous false
password_file /mosquitto/config/passwd
```

Generate password file:

```bash
docker compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd username
```

#### Node-RED

Edit `config/nodered/settings.js` to customize:

- Security settings
- Available nodes
- Function timeout
- Context storage

#### Grafana

Add datasources: `config/grafana/provisioning/datasources/`
Add dashboards: `config/grafana/dashboards/`

---

## 🔌 SDK Integration

### TouchDesigner

```python
# OSC Out DAT configuration
Network Address: <docker-host-ip>
Network Port: 57120
Protocol: UDP

# Send OSC message
import oscP5.*
oscP5 = OscP5(this, 12000)
myMessage = OscMessage("/device/sensor/temperature")
myMessage.add(23.5)
oscP5.send(myMessage, "<docker-host-ip>", 57120)
```

### Max/MSP

```
[udpsend <docker-host-ip> 57120]
  |
[prepend /device/sensor]
  |
[send $1 $2]
```

### Arduino / ESP32

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* mqtt_server = "<docker-host-ip>";
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

void setup() {
  client.setServer(mqtt_server, mqtt_port);
  client.connect("ESP32_Device");
  client.publish("maestra/devices/esp32/status", "online");
}
```

### Web / JavaScript

```javascript
// WebSocket connection
const ws = new WebSocket('ws://<docker-host-ip>:8765');

ws.onopen = () => {
  // Publish message
  ws.send(JSON.stringify({
    type: 'publish',
    subject: 'maestra.web.event',
    data: { temperature: 23.5 }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// MQTT over WebSocket
import mqtt from 'mqtt';
const client = mqtt.connect('ws://<docker-host-ip>:9001');

client.on('connect', () => {
  client.subscribe('maestra/devices/#');
  client.publish('maestra/web/status', 'connected');
});
```

### Raspberry Pi

```python
import paho.mqtt.client as mqtt

client = mqtt.Client("RaspberryPi_Device")
client.connect("<docker-host-ip>", 1883, 60)

# Publish telemetry
client.publish("maestra/devices/rpi/cpu_temp", "45.2")
client.loop_start()
```

---

## 💻 Development

### Running Specific Services

```bash
# Start only message bus
docker compose up -d nats mosquitto redis

# Start database
docker compose up -d postgres

# Start with logs
docker compose up nodered
```

### Rebuilding Services

```bash
# Rebuild specific service
docker compose build fleet-manager

# Rebuild and restart
docker compose up -d --build fleet-manager
```

### Accessing Service Shells

```bash
# Access PostgreSQL
docker compose exec postgres psql -U maestra -d maestra

# Access Redis CLI
docker compose exec redis redis-cli

# Access Node-RED container
docker compose exec nodered /bin/bash
```

### Development Workflow

```bash
# Make changes to service code
vim services/fleet-manager/main.py

# Rebuild and restart
docker compose up -d --build fleet-manager

# View logs
docker compose logs -f fleet-manager
```

---

## 🚢 Production Deployment

### Production vs Development

| Aspect | Development | Production |
|--------|-------------|-----------|
| Environment | Local Docker | Cloud VMs / Kubernetes |
| Passwords | Default (admin/admin) | Strong, unique passwords |
| Authentication | Disabled/basic | Enabled on all services |
| SSL/TLS | HTTP only | HTTPS with Let's Encrypt |
| Volumes | Local bind mounts | Named volumes / NFS |
| Backups | Manual | Automated (cron) |
| Monitoring | Optional | Required (Grafana alerts) |
| Resource Limits | None | CPU/Memory limits set |
| Logging | Docker logs | Centralized (Loki/ELK) |
| Networking | Bridge network | Custom network / VPN |

### Production Deployment Checklist

#### 1. Environment Configuration

```bash
# Strong passwords (use password generator)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 16)

# Production environment
NODE_ENV=production
```

#### 2. Authentication & Authorization

**Enable Grafana Authentication:**
```ini
# config/grafana/grafana.ini
[auth.anonymous]
enabled = false

[security]
admin_user = admin
admin_password = ${GRAFANA_PASSWORD}
```

**Enable Node-RED Authentication:**
```javascript
// config/nodered/settings.js
adminAuth: {
    type: "credentials",
    users: [{
        username: "admin",
        password: "$2b$08$...",  // Use bcrypt hash
        permissions: "*"
    }]
}
```

**Enable NATS Authentication:**
```yaml
# config/nats/nats.conf
authorization: {
    users: [
        {user: admin, password: "your-secure-password"}
    ]
}
```

**Enable Mosquitto Authentication:**
```bash
# Generate password file
docker compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd maestra

# Edit config/mosquitto/mosquitto.conf
allow_anonymous false
password_file /mosquitto/config/passwd
```

#### 3. SSL/TLS with Traefik & Let's Encrypt

**Update `config/traefik/traefik.yml`:**
```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https

  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@yourdomain.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
```

**Update service labels in `docker-compose.yml`:**
```yaml
labels:
  - "traefik.http.routers.dashboard.tls=true"
  - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
```

#### 4. Database Backups

**Automated Backup Script** (`scripts/backup-db.sh`):
```bash
#!/bin/bash
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U maestra maestra | gzip > $BACKUP_DIR/maestra_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: maestra_$DATE.sql.gz"
```

**Add to crontab:**
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/maestra-core/scripts/backup-db.sh >> /var/log/maestra-backup.log 2>&1
```

#### 5. Monitoring & Alerting

**Configure Grafana Alerts:**
1. Navigate to **Alerting → Contact points**
2. Add email or Slack contact point
3. Create alert rules for:
   - CPU/Memory > 80% for 5 minutes
   - Database connection pool exhaustion
   - High error rate (> 10 errors/min)
   - Device heartbeat failures
   - NATS/MQTT connection drops

**Health Check Script** (`scripts/health-check.sh`):
```bash
#!/bin/bash
SERVICES=("fleet-manager:8080/health" "nats:8222/varz" "grafana:3000/api/health")

for service in "${SERVICES[@]}"; do
  name=$(echo $service | cut -d: -f1)
  endpoint=$(echo $service | cut -d: -f2-)

  if curl -sf http://$endpoint > /dev/null; then
    echo "✅ $name is healthy"
  else
    echo "❌ $name is down"
    # Send alert (email, Slack, PagerDuty, etc.)
  fi
done
```

#### 6. Resource Limits

**Update `docker-compose.yml`:**
```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

  fleet-manager:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  nats:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
```

#### 7. Log Management

**Configure log rotation:**
```yaml
# docker-compose.yml
services:
  fleet-manager:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

**Centralized logging with Loki (optional):**
```yaml
# Add to docker-compose.yml
loki:
  image: grafana/loki:latest
  ports:
    - "3100:3100"
  volumes:
    - ./config/loki:/etc/loki
    - loki-data:/loki
```

### Cloud Deployment

#### AWS EC2 Deployment

**1. Launch EC2 Instance:**
- Instance type: t3.large (2 vCPU, 8GB RAM) or larger
- AMI: Ubuntu 22.04 LTS
- Storage: 50GB+ EBS volume
- Security Group: Open ports 80, 443, 1883, 8765, 57120-57121

**2. Install Docker:**
```bash
ssh ubuntu@<ec2-ip>

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Logout and login again
exit
ssh ubuntu@<ec2-ip>
```

**3. Deploy Maestra:**
```bash
git clone <repo-url>
cd maestra-core
cp .env.example .env
nano .env  # Update passwords

# Start services
docker compose up -d

# Verify
docker compose ps
curl http://localhost:8080/health
```

**4. Configure DNS:**
- Point A records to EC2 Elastic IP:
  - `maestra.yourdomain.com` → EC2 IP
  - `dashboard.yourdomain.com` → EC2 IP
  - `grafana.yourdomain.com` → EC2 IP

**5. Enable SSL:**
Update Traefik configuration and restart services.

#### Docker Swarm (Multi-Node)

**Initialize Swarm:**
```bash
# On manager node
docker swarm init --advertise-addr <manager-ip>

# On worker nodes (use token from above)
docker swarm join --token <token> <manager-ip>:2377
```

**Deploy Stack:**
```bash
docker stack deploy -c docker-compose.yml maestra
docker stack ps maestra
```

#### Kubernetes (Future)

Maestra can be adapted for Kubernetes deployment using Helm charts (planned for future release).

### Production Troubleshooting

#### Service Won't Start

```bash
# Check logs
docker compose logs <service>

# Check resource usage
docker stats

# Verify environment
docker compose config

# Check disk space
df -h
```

#### High Latency

```bash
# Check database connections
docker compose exec postgres psql -U maestra -c "SELECT count(*) FROM pg_stat_activity;"

# Check NATS connections
curl http://localhost:8222/connz

# Monitor resource usage
docker stats --no-stream
```

#### Memory Issues

```bash
# Restart memory-hungry service
docker compose restart <service>

# Check logs for memory errors
docker compose logs | grep -i "memory\|oom"

# Add swap space (temporary fix)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### Database Connection Pool Exhausted

```bash
# Check active connections
docker compose exec postgres psql -U maestra -c "
  SELECT count(*), state FROM pg_stat_activity
  GROUP BY state;
"

# Increase max connections (config/postgres/postgresql.conf)
max_connections = 200

# Restart PostgreSQL
docker compose restart postgres
```

### Security Hardening

#### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 1883/tcp # MQTT (if external)
sudo ufw enable
```

#### Regular Updates

```bash
# Update Docker images
docker compose pull
docker compose up -d

# Update system packages
sudo apt update && sudo apt upgrade -y
```

#### Secrets Management

Use Docker secrets or external secret managers:
```bash
# Create secret
echo "my-secret-password" | docker secret create postgres_password -

# Use in docker-compose.yml
secrets:
  postgres_password:
    external: true

services:
  postgres:
    secrets:
      - postgres_password
```

### Backup Strategy

**Daily Automated Backups:**
```bash
# Create backup script
cat > /usr/local/bin/maestra-backup <<'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/maestra"
mkdir -p $BACKUP_DIR

# PostgreSQL backup
docker compose exec -T postgres pg_dump -U maestra maestra | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Node-RED flows
docker compose cp nodered:/data/flows.json $BACKUP_DIR/flows_$DATE.json

# Grafana dashboards
docker compose cp grafana:/var/lib/grafana $BACKUP_DIR/grafana_$DATE

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 sync $BACKUP_DIR s3://my-maestra-backups/
EOF

chmod +x /usr/local/bin/maestra-backup

# Add to crontab
echo "0 2 * * * /usr/local/bin/maestra-backup" | crontab -
```

**Disaster Recovery:**
```bash
# Restore PostgreSQL
gunzip < backup.sql.gz | docker compose exec -T postgres psql -U maestra maestra

# Restore Node-RED flows
docker compose cp flows.json nodered:/data/flows.json
docker compose restart nodered
```

### Performance Optimization

#### Database Tuning

**Edit `config/postgres/postgresql.conf`:**
```conf
# Memory settings
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB

# Connection settings
max_connections = 200

# TimescaleDB settings
timescaledb.max_background_workers = 8
```

#### NATS Tuning

**Edit `config/nats/nats.conf`:**
```conf
max_connections: 1000
max_payload: 1048576      # 1MB
write_deadline: "10s"
```

#### Redis Memory Limit

```yaml
# docker-compose.yml
redis:
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

---

## 🔧 Troubleshooting

### Service Won't Start

```bash
# Check logs
docker compose logs <service-name>

# Check service status
docker compose ps

# Restart service
docker compose restart <service-name>
```

### Port Conflicts

```bash
# Check what's using a port
sudo lsof -i :8080

# Change port in docker compose.yml
ports:
  - "8081:8080"  # Map to different host port
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
docker compose exec postgres pg_isready -U maestra

# Check connection from fleet-manager
docker compose exec fleet-manager ping postgres
```

### MQTT Connection Issues

```bash
# Test MQTT connectivity
docker compose exec mosquitto mosquitto_sub -t '#' -v

# From external client
mosquitto_pub -h localhost -t test -m "hello"
```

### Clear Everything and Start Fresh

```bash
# Stop and remove all containers
docker compose down

# Remove volumes (⚠️ DELETES ALL DATA)
docker compose down -v

# Remove images
docker compose down --rmi all

# Start fresh
docker compose up -d
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Check service health
docker compose exec <service> top

# View container logs for errors
docker compose logs --tail=100 <service>
```

---

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [NATS Documentation](https://docs.nats.io/)
- [Node-RED Documentation](https://nodered.org/docs/)
- [TimescaleDB Documentation](https://docs.timescale.com/)
- [TouchDesigner OSC](https://docs.derivative.ca/OSC)
- [Max/MSP OSC](https://docs.cycling74.com/max8/vignettes/osc)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE)
