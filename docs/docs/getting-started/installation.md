# Installation

This guide walks you through installing Maestra on your local machine. By the end, you will have the full platform running and ready for your first project.

## Prerequisites

You need two things installed: **Docker Desktop** and **Git**.

### Docker Desktop

Docker runs all of Maestra's services in containers, so you do not need to install databases, message brokers, or web servers individually.

**Minimum version:** Docker Desktop 4.0+ (which includes Docker Compose V2)

**Download:** [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)

After installing, verify it is working:

```bash
docker --version
# Docker version 27.x.x or later

docker compose version
# Docker Compose version v2.x.x or later
```

**Important:** Open Docker Desktop and increase the memory limit to at least **8 GB**. Go to Settings > Resources > Memory and drag the slider. Maestra runs about a dozen services and needs the headroom.

### Git

**Download:** [git-scm.com](https://git-scm.com/)

Verify it is installed:

```bash
git --version
# git version 2.x.x or later
```

### System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 8 GB allocated to Docker | 16 GB |
| Disk | 5 GB free | 10 GB free |
| CPU | 4 cores | 8 cores |
| OS | macOS 12+, Windows 10+, Ubuntu 20.04+ | Latest stable |

## Step-by-Step Installation

### 1. Clone the repository

```bash
git clone https://github.com/maestra/maestra-core.git
cd maestra-core
```

### 2. Create the environment file

```bash
make init
```

This copies `.env.example` to `.env` with sensible defaults. You can edit `.env` later to change passwords or ports, but the defaults work fine for local development.

### 3. Start all services

```bash
make up
```

This pulls Docker images on the first run (which may take a few minutes depending on your internet connection) and starts all services in the background.

### 4. Wait for services to start

Give the services about 30 seconds to initialize, then check their health:

```bash
make health
```

You should see green checkmarks for Fleet Manager, NATS, Node-RED, and Grafana.

### 5. Open the Dashboard

Open [http://localhost:3001](http://localhost:3001) in your browser. You should see the Maestra Dashboard with an empty device list, ready for your first connections.

## Verify Your Installation

Run these commands to confirm everything is working:

```bash
# Check that all containers are running
make ps

# Test the Fleet Manager API
curl http://localhost:8080/health

# Publish a test MQTT message
make test-mqtt

# Open the interactive API docs
open http://localhost:8080/docs
```

## Services Available After Install

| Service | URL | What You Will See |
|---|---|---|
| Dashboard | [localhost:3001](http://localhost:3001) | Device and entity management UI |
| Fleet Manager API | [localhost:8080/docs](http://localhost:8080/docs) | Interactive Swagger API docs |
| Node-RED | [localhost:1880](http://localhost:1880) | Visual flow editor |
| Grafana | [localhost:3000](http://localhost:3000) | Monitoring dashboards (login: admin / admin) |
| Documentation | [localhost:8000](http://localhost:8000) | Full platform docs |
| NATS Monitor | [localhost:8222](http://localhost:8222) | Message bus stats |

## Troubleshooting

### Port conflicts

If a service fails to start, another application may already be using that port. Check for conflicts:

```bash
# On macOS / Linux
lsof -i :3001
lsof -i :8080

# On Windows (PowerShell)
netstat -ano | findstr :3001
```

To resolve a conflict, either stop the other application or change the port in `docker-compose.yml`. For example, to move the Dashboard from port 3001 to 3002:

```yaml
dashboard:
  ports:
    - "3002:3000"   # Changed from "3001:3000"
```

### Docker Desktop memory limit

If services crash or restart repeatedly, Docker may not have enough memory. Open Docker Desktop > Settings > Resources and increase memory to at least **8 GB**. Restart Docker Desktop after changing this setting.

### Apple Silicon (M1 / M2 / M3 Macs)

Maestra runs natively on Apple Silicon. All images are built for both `amd64` and `arm64` architectures. If you encounter an image compatibility warning, ensure Docker Desktop is updated to the latest version.

### Windows with WSL2

On Windows, Docker Desktop uses WSL2 as its backend. If you experience slow performance or file-watching issues:

1. Make sure WSL2 is enabled (Docker Desktop > Settings > General > "Use the WSL 2 based engine")
2. Clone the repository inside WSL2's filesystem (e.g., `~/projects/`) rather than on the Windows filesystem (`/mnt/c/...`) for significantly better I/O performance
3. Allocate at least 8 GB of memory to WSL2 by creating or editing `~/.wslconfig`:

```ini
[wsl2]
memory=8GB
```

### Services will not start

Check the logs for error details:

```bash
# All service logs
make logs

# Logs for a specific service
make logs-service SERVICE=fleet-manager
```

Common causes:

- **Database not ready:** The first startup takes longer because PostgreSQL initializes schemas. Wait 60 seconds and run `make health` again.
- **Image pull failure:** If Docker images fail to download, check your internet connection and run `make up` again.
- **Stale containers:** If you previously ran a different version, clean up and start fresh:

```bash
make clean      # Remove containers (keeps data)
make up         # Start fresh
```

### Nuclear option: full reset

If nothing else works, remove everything and start completely fresh. This deletes all data including database contents:

```bash
make clean-all  # Removes containers, networks, AND volumes
make up         # Fresh start
```

## Environment Variables

The `.env` file controls service configuration. Key variables:

```bash
# Database password (change for production)
POSTGRES_PASSWORD=maestra_password

# Grafana admin password
GRAFANA_PASSWORD=admin

# MQTT credentials (optional for local dev)
MQTT_USERNAME=maestra
MQTT_PASSWORD=maestra_password
```

For a full list of environment variables, see [Configuration](../../infrastructure/configuration.md).

## What to Do Next

You now have the full Maestra platform running. Here are your next steps:

- **[Quick Start Guide](../getting-started/quickstart.md)** -- Connect your first device and send a message in 5 minutes
- **[Choose Your SDK](../guides/choose-your-sdk.md)** -- Find the right SDK for TouchDesigner, Max/MSP, Unity, Unreal, Arduino, or web
- **[Architecture Overview](../getting-started/architecture.md)** -- Understand how the system fits together
- **[Device Registration Guide](../guides/device-registration.md)** -- Register and manage devices through the API
- **[Node-RED Guide](../guides/nodered.md)** -- Build visual automation flows
