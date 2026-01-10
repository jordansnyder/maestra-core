# Installation

## Prerequisites

- Docker and Docker Compose
- Git

## Quick Install

```bash
# Clone the repository
git clone https://github.com/maestra/maestra-core.git
cd maestra-core

# Start all services
make up

# Or using docker compose directly
docker compose up -d
```

## Services

Once running, the following services are available:

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | http://localhost:3001 | Web UI for management |
| Fleet Manager API | http://localhost:8080 | REST API |
| API Docs | http://localhost:8080/docs | Swagger UI |
| Node-RED | http://localhost:1880 | Visual automation |
| Grafana | http://localhost:3000 | Monitoring dashboards |
| Documentation | http://localhost:8000 | This documentation |

## Environment Variables

Create a `.env` file in the project root to customize:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Grafana
GRAFANA_PASSWORD=admin

# MQTT
MQTT_USERNAME=maestra
MQTT_PASSWORD=your_mqtt_password
```

## Verify Installation

```bash
# Check service health
curl http://localhost:8080/health

# List entities
curl http://localhost:8080/entities
```
