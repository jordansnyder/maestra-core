# Configuration

!!! tip "Are you an artist connecting to an existing Maestra?"
    You don't need to configure anything. Head to [Connect Your Tool](../connect/touchdesigner.md) instead. This page is for **admins** managing a Maestra instance.

## Environment Variables

Maestra is configured through a `.env` file in the project root. Run `make init` to create one from the defaults.

### Required

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `maestra_password` | Database password |
| `DATABASE_URL` | (auto-generated) | Full PostgreSQL connection string |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

### Message Bus

| Variable | Default | Description |
|----------|---------|-------------|
| `NATS_URL` | `nats://nats:4222` | NATS server connection |
| `MQTT_BROKER` | `mosquitto:1883` | MQTT broker address |
| `MQTT_USERNAME` | `maestra` | MQTT authentication username |
| `MQTT_PASSWORD` | `maestra_password` | MQTT authentication password |

### Gateways

| Variable | Default | Description |
|----------|---------|-------------|
| `OSC_IN_PORT` | `57120` | OSC receive port |
| `OSC_OUT_PORT` | `57121` | OSC send port |

### Development

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |

## Common Commands

```bash
make up              # Start all services
make down            # Stop all services
make restart         # Restart all services
make clean           # Stop and remove containers (keeps data volumes)
make clean-all       # Remove everything including data (DESTRUCTIVE)

make dev-core        # Start core services only (bus, db, fleet-manager, nodered)
make dev-bus         # Start only message bus (NATS, Mosquitto, Redis)
make dev-db          # Start only database

make build           # Rebuild all custom services
make logs            # View all logs
make logs-service SERVICE=fleet-manager  # Logs for specific service
make ps              # Show service status
make health          # Check all service health

make migrate         # Run pending database migrations
make migrate-status  # Show which migrations have been applied
make backup-db       # Backup database to backups/
make restore-db FILE=backups/backup.sql
```

## Docker Network

All services communicate on the `maestra-network` Docker bridge network (172.28.0.0/16). Service-to-service communication uses container names as hostnames (e.g., `nats:4222`, `postgres:5432`).

## Service Configuration Files

Individual service configs are stored in `config/<service>/`:

| Path | What it configures |
|------|--------------------|
| `config/mosquitto/` | MQTT broker settings and ACLs |
| `config/grafana/` | Dashboard provisioning and datasources |
| `config/postgres/init/` | Database initialization scripts |
| `config/postgres/migrations/` | Schema migration files |
| `config/nodered/` | Node-RED settings |

## Port Reference

| Port | Service |
|------|---------|
| 80/443 | Traefik (HTTP/HTTPS) |
| 1880 | Node-RED |
| 1883 | MQTT (TCP) |
| 3000 | Grafana |
| 3001 | Dashboard |
| 4222 | NATS Client |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 8000 | Documentation (MkDocs) |
| 8080 | Fleet Manager API |
| 8222 | NATS HTTP Monitor |
| 8765 | WebSocket Gateway |
| 9001 | MQTT WebSocket |
| 57120/57121 | OSC Gateway (UDP) |
| 6454 | Art-Net / DMX (UDP, opt-in) |
