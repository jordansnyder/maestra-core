# Maestra Infrastructure Makefile
# Convenience commands for managing Docker services

.PHONY: help up down restart logs ps clean build health init

# Default target
.DEFAULT_GOAL := help

# Docker Compose command (supports both V1 and V2)
DOCKER_COMPOSE := $(shell if command -v docker-compose > /dev/null 2>&1; then echo "docker-compose"; else echo "docker compose"; fi)

help: ## Show this help message
	@echo "Maestra Infrastructure Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

init: ## Initialize environment (copy .env.example to .env)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env file. Please edit it with your configuration."; \
	else \
		echo "⚠️  .env already exists. Skipping..."; \
	fi

up: ## Start all services
	$(DOCKER_COMPOSE) up -d
	@echo "✅ All services started. Run 'make logs' to view logs."

down: ## Stop all services
	$(DOCKER_COMPOSE) down
	@echo "✅ All services stopped."

restart: ## Restart all services
	$(DOCKER_COMPOSE) restart
	@echo "✅ All services restarted."

logs: ## View logs from all services (Ctrl+C to exit)
	$(DOCKER_COMPOSE) logs -f

logs-service: ## View logs from a specific service (usage: make logs-service SERVICE=fleet-manager)
	@if [ -z "$(SERVICE)" ]; then \
		echo "❌ Please specify SERVICE. Example: make logs-service SERVICE=fleet-manager"; \
		exit 1; \
	fi
	$(DOCKER_COMPOSE) logs -f $(SERVICE)

ps: ## Show status of all services
	$(DOCKER_COMPOSE) ps

health: ## Check health of all services
	@echo "Checking service health..."
	@echo ""
	@curl -s http://localhost:8080/health | jq . || echo "❌ Fleet Manager (port 8080) not responding"
	@echo ""
	@curl -s http://localhost:8222 > /dev/null && echo "✅ NATS (port 8222) is healthy" || echo "❌ NATS not responding"
	@echo ""
	@curl -s http://localhost:1880 > /dev/null && echo "✅ Node-RED (port 1880) is healthy" || echo "❌ Node-RED not responding"
	@echo ""
	@curl -s http://localhost:3000 > /dev/null && echo "✅ Grafana (port 3000) is healthy" || echo "❌ Grafana not responding"

build: ## Rebuild all custom services
	$(DOCKER_COMPOSE) build

build-service: ## Rebuild a specific service (usage: make build-service SERVICE=fleet-manager)
	@if [ -z "$(SERVICE)" ]; then \
		echo "❌ Please specify SERVICE. Example: make build-service SERVICE=fleet-manager"; \
		exit 1; \
	fi
	$(DOCKER_COMPOSE) build $(SERVICE)

clean: ## Stop and remove all containers, networks (keeps volumes)
	$(DOCKER_COMPOSE) down
	@echo "✅ Containers and networks removed. Volumes preserved."

clean-all: ## Stop and remove everything including volumes (⚠️  DELETES ALL DATA)
	@echo "⚠️  WARNING: This will delete all data including databases!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(DOCKER_COMPOSE) down -v; \
		echo "✅ Everything removed including volumes."; \
	else \
		echo "❌ Cancelled."; \
	fi

dev-bus: ## Start only message bus services (NATS, Mosquitto, Redis)
	$(DOCKER_COMPOSE) up -d nats mosquitto redis
	@echo "✅ Message bus services started."

dev-db: ## Start only database services
	$(DOCKER_COMPOSE) up -d postgres
	@echo "✅ Database started."

dev-core: ## Start core services (bus, db, fleet-manager, nodered)
	$(DOCKER_COMPOSE) up -d nats mosquitto redis postgres fleet-manager nodered
	@echo "✅ Core services started."

shell-postgres: ## Open PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres psql -U maestra -d maestra

shell-redis: ## Open Redis CLI
	$(DOCKER_COMPOSE) exec redis redis-cli

shell-fleet: ## Open Fleet Manager shell
	$(DOCKER_COMPOSE) exec fleet-manager /bin/bash

backup-db: ## Backup PostgreSQL database
	@mkdir -p backups
	$(DOCKER_COMPOSE) exec postgres pg_dump -U maestra maestra > backups/backup-$$(date +%Y%m%d-%H%M%S).sql
	@echo "✅ Database backed up to backups/ directory"

restore-db: ## Restore PostgreSQL database (usage: make restore-db FILE=backups/backup.sql)
	@if [ -z "$(FILE)" ]; then \
		echo "❌ Please specify FILE. Example: make restore-db FILE=backups/backup.sql"; \
		exit 1; \
	fi
	@if [ ! -f $(FILE) ]; then \
		echo "❌ File $(FILE) not found"; \
		exit 1; \
	fi
	cat $(FILE) | $(DOCKER_COMPOSE) exec -T postgres psql -U maestra -d maestra
	@echo "✅ Database restored from $(FILE)"

test-mqtt: ## Test MQTT connection (publishes test message)
	$(DOCKER_COMPOSE) exec mosquitto mosquitto_pub -t "maestra/test" -m "Hello from Maestra"
	@echo "✅ Test message published to MQTT topic: maestra/test"

watch: ## Watch service logs in real-time (requires watch command)
	watch -n 2 '$(DOCKER_COMPOSE) ps'

stats: ## Show container resource usage
	docker stats $$($(DOCKER_COMPOSE) ps -q)

update: ## Pull latest images and restart
	$(DOCKER_COMPOSE) pull
	$(DOCKER_COMPOSE) up -d
	@echo "✅ Services updated and restarted."

# Development shortcuts
.PHONY: dev-bus dev-db dev-core shell-postgres shell-redis shell-fleet
.PHONY: backup-db restore-db test-mqtt watch stats update
