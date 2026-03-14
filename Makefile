# Maestra Infrastructure Makefile
# Convenience commands for managing Docker services

.PHONY: help up down restart logs ps clean build health init demo seed-demo

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
	@echo ""
	@echo "✅ All services started."
	@echo ""
	@echo "  🌐 Dashboard      http://localhost:3001"
	@echo "  🔧 Node-RED       http://localhost:1880"
	@echo "  📊 Grafana        http://localhost:3000"
	@echo "  📡 API Docs       http://localhost:8080/docs"
	@echo ""

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
	@echo ""
	@echo "  Maestra Service Health"
	@echo "  ━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@printf "  %-20s " "Fleet Manager" && (curl -sf http://localhost:8080/health > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "Dashboard" && (curl -sf http://localhost:3001 > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "NATS" && (curl -sf http://localhost:8222 > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "Node-RED" && (curl -sf http://localhost:1880 > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "Grafana" && (curl -sf http://localhost:3000/api/health > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "MQTT" && ($(DOCKER_COMPOSE) exec -T mosquitto mosquitto_sub -t '$$SYS/broker/uptime' -C 1 -W 2 > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "Redis" && ($(DOCKER_COMPOSE) exec -T redis redis-cli ping > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@printf "  %-20s " "PostgreSQL" && ($(DOCKER_COMPOSE) exec -T postgres pg_isready > /dev/null 2>&1 && echo "✅ healthy" || echo "❌ not responding")
	@echo ""

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

demo: ## Start Maestra with demo data (recommended for first-time users)
	@echo ""
	@echo "🎭 Starting Maestra with demo data..."
	@echo ""
	@DEMO_MODE=true $(DOCKER_COMPOSE) up -d
	@echo ""
	@echo "⏳ Waiting for services to initialize..."
	@sleep 8
	@echo ""
	@echo "✅ Maestra is ready!"
	@echo ""
	@echo "  🌐 Dashboard      http://localhost:3001"
	@echo "  🔧 Node-RED       http://localhost:1880"
	@echo "  📊 Grafana        http://localhost:3000  (admin / admin)"
	@echo "  📡 API Docs       http://localhost:8080/docs"
	@echo "  📖 Documentation  http://localhost:8000"
	@echo ""
	@echo "  Demo data is pre-loaded. Open the Dashboard to start exploring!"
	@echo ""

seed-demo: ## Seed demo data into an existing database
	@echo "🌱 Seeding demo data..."
	@$(DOCKER_COMPOSE) exec -T postgres psql -U $${POSTGRES_USER:-maestra} -d $${POSTGRES_DB:-maestra} < config/postgres/init/06-demo-data.sql
	@echo "✅ Demo data loaded."

shell-postgres: ## Open PostgreSQL shell
	$(DOCKER_COMPOSE) exec postgres psql -U maestra -d maestra

shell-redis: ## Open Redis CLI
	$(DOCKER_COMPOSE) exec redis redis-cli

shell-fleet: ## Open Fleet Manager shell
	$(DOCKER_COMPOSE) exec fleet-manager /bin/bash

migrate: ## Run pending database migrations
	@./scripts/migrate.sh

migrate-status: ## Show database migration status
	@./scripts/migrate.sh --status

migrate-dry-run: ## Show pending migrations without executing
	@./scripts/migrate.sh --dry-run

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

# =============================================================================
# DMX / ART-NET GATEWAY
# =============================================================================

up-dmx: ## Start full stack including the DMX gateway (requires DMX hardware)
	$(DOCKER_COMPOSE) --profile dmx up -d
	@echo ""
	@echo "✅ Maestra + DMX gateway started."
	@echo ""
	@echo "  Configure Art-Net nodes and fixtures via the Dashboard → DMX Lighting."
	@echo "  The gateway loads config from the database automatically."
	@echo ""

dev-dmx: ## Start core services + DMX gateway for development
	$(DOCKER_COMPOSE) --profile dmx up -d nats redis postgres fleet-manager dmx-gateway
	@echo "✅ Core services + DMX gateway started."

logs-dmx: ## View DMX gateway logs
	$(DOCKER_COMPOSE) logs -f dmx-gateway

build-dmx: ## Rebuild the DMX gateway image
	$(DOCKER_COMPOSE) build dmx-gateway

test-dmx: ## Send a test entity state change via NATS
	@echo "📡 Publishing test entity state to NATS..."
	$(DOCKER_COMPOSE) exec nats nats pub maestra.entity.state.test \
	  '{"entity_path":"test.fixture","state":{"intensity":0.8,"red":1.0,"green":0.0,"blue":0.0}}'
	@echo "✅ Test state published. Check DMX gateway logs: make logs-dmx"

sync-ofl: ## Run OFL fixture sync manually (never runs automatically)
	docker compose --profile ofl-sync run --build --rm ofl-sync

ofl-status: ## Show last 5 OFL sync results
	docker compose exec postgres psql -U maestra -d maestra \
	  -c "SELECT ran_at, ofl_commit_sha, fixtures_added, fixtures_updated, fixtures_errored, status FROM ofl_sync_log ORDER BY ran_at DESC LIMIT 5;"

watch: ## Watch service logs in real-time (requires watch command)
	watch -n 2 '$(DOCKER_COMPOSE) ps'

stats: ## Show container resource usage
	docker stats $$($(DOCKER_COMPOSE) ps -q)

update: ## Pull latest images and restart
	$(DOCKER_COMPOSE) pull
	$(DOCKER_COMPOSE) up -d
	@echo "✅ Services updated and restarted."

# =============================================================================
# ENVIRONMENT DEPLOYMENT
# =============================================================================

deploy-test: ## Deploy to test environment
	@if [ ! -f .env.test ]; then \
		echo "❌ .env.test not found. Copy .env.test.example and configure it."; \
		exit 1; \
	fi
	cp .env.test .env
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.test.yml build
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.test.yml down --remove-orphans
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.test.yml up -d
	@echo "✅ Test environment deployed."

deploy-prod: ## Deploy to production environment
	@if [ ! -f .env.prod ]; then \
		echo "❌ .env.prod not found. Create it with production values."; \
		exit 1; \
	fi
	cp .env.prod .env
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml build
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo "✅ Production environment deployed."

stop-test: ## Stop test environment
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.test.yml down
	@echo "✅ Test environment stopped."

stop-prod: ## Stop production environment
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml down
	@echo "✅ Production environment stopped."

logs-test: ## View test environment logs
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.test.yml logs -f

logs-prod: ## View production environment logs
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Development shortcuts
.PHONY: dev-bus dev-db dev-core shell-postgres shell-redis shell-fleet
.PHONY: migrate migrate-status migrate-dry-run
.PHONY: backup-db restore-db test-mqtt watch stats update
.PHONY: deploy-test deploy-prod stop-test stop-prod logs-test logs-prod
.PHONY: up-dmx dev-dmx logs-dmx build-dmx test-dmx sync-ofl ofl-status
