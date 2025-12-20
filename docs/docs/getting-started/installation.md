# Installation Guide

Complete guide to installing and configuring Maestra.

## System Requirements

### Minimum Requirements
- **OS**: Linux, macOS, or Windows with WSL2
- **Docker**: 20.10 or newer
- **Docker Compose**: V2 (plugin-based)
- **RAM**: 8GB
- **Disk**: 10GB free space
- **CPU**: 2+ cores

### Recommended Requirements
- **RAM**: 16GB+
- **CPU**: 4+ cores
- **SSD**: For database performance

## Docker Installation

### macOS
```bash
# Install Docker Desktop
brew install --cask docker
```

### Linux (Ubuntu/Debian)
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Windows
1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/windows/install/)
2. Enable WSL2 backend
3. Use WSL2 terminal for all commands

## Install Maestra

### Clone Repository

```bash
git clone https://github.com/jordansnyder/maestra-core.git
cd maestra-core
```

### Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Important Settings:**

```bash
# Database (change for production!)
POSTGRES_PASSWORD=your_secure_password

# Grafana (change for production!)
GRAFANA_PASSWORD=your_admin_password

# Security
JWT_SECRET=generate_random_string_here
```

### Start Services

```bash
# Start all services
make up

# Or without Make
docker compose up -d
```

### Verify Installation

```bash
# Check all services are running
docker compose ps

# Check health
make health

# View logs
make logs
```

All services should show as "Up" or "healthy".

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Dashboard | 3001 | HTTP |
| Node-RED | 1880 | HTTP |
| Grafana | 3000 | HTTP |
| Fleet Manager API | 8080 | HTTP |
| NATS | 4222 | TCP |
| NATS Monitoring | 8222 | HTTP |
| MQTT | 1883 | TCP |
| MQTT WebSocket | 9001 | WS |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |
| WebSocket Gateway | 8765 | WS |
| OSC Gateway | 57120 | UDP |
| Portainer | 9443 | HTTPS |

## Configuration Files

### Mosquitto MQTT
`config/mosquitto/mosquitto.conf`

```conf
# Enable authentication (production)
allow_anonymous false
password_file /mosquitto/config/passwd
```

Generate password file:
```bash
docker compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd username
```

### Node-RED
`config/nodered/settings.js`

Enable authentication:
```javascript
adminAuth: {
    type: "credentials",
    users: [{
        username: "admin",
        password: "$2a$08$...", // bcrypt hash
        permissions: "*"
    }]
}
```

### Grafana
`config/grafana/provisioning/datasources/datasources.yml`

Pre-configured for PostgreSQL and Redis.

## Production Setup

### Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Enable Mosquitto authentication
- [ ] Enable Node-RED authentication
- [ ] Configure SSL/TLS with Traefik
- [ ] Set up firewall rules
- [ ] Enable PostgreSQL SSL
- [ ] Review CORS settings
- [ ] Set secure JWT secret
- [ ] Disable debug endpoints

### SSL/TLS with Traefik

Edit `config/traefik/traefik.yml`:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your@email.com
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
```

### Resource Limits

Edit `docker-compose.yml`:

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

### Backup Strategy

```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U maestra maestra > backup.sql

# Backup volumes
docker run --rm -v maestra-core_postgres-data:/data \
  -v $(pwd):/backup alpine \
  tar czf /backup/postgres-backup.tar.gz /data
```

## Updating Maestra

```bash
# Pull latest changes
git pull

# Update images
docker compose pull

# Rebuild custom services
docker compose build

# Restart with new images
docker compose up -d

# Or use Make
make update
```

## Uninstallation

```bash
# Stop all services
docker compose down

# Remove volumes (⚠️ deletes all data)
docker compose down -v

# Remove images
docker compose down --rmi all
```

## Troubleshooting

### Port Conflicts

```bash
# Find what's using a port
sudo lsof -i :8080

# Change port in docker-compose.yml
ports:
  - "8081:8080"
```

### Permission Errors

```bash
# Fix Docker permissions (Linux)
sudo usermod -aG docker $USER
newgrp docker
```

### Database Connection Issues

```bash
# Check PostgreSQL
docker compose exec postgres pg_isready -U maestra

# View logs
docker compose logs postgres
```

## Next Steps

- [Architecture Overview](architecture.md)
- [Quick Start Guide](quickstart.md)
- [Device Registration](../guides/device-registration.md)

---

Need help? Check the [GitHub Issues](https://github.com/jordansnyder/maestra-core/issues).
