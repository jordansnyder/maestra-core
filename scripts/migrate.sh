#!/usr/bin/env bash
# Maestra Database Migration Runner
# Applies pending SQL migrations from config/postgres/migrations/
# Each migration runs once and is tracked in the schema_migrations table.
#
# Usage:
#   ./scripts/migrate.sh                  # Run pending migrations
#   ./scripts/migrate.sh --status         # Show migration status
#   ./scripts/migrate.sh --dry-run        # Show what would run without executing

set -euo pipefail

# Configuration
MIGRATIONS_DIR="config/postgres/migrations"
DB_CONTAINER="maestra-postgres"
DB_USER="maestra"
DB_NAME="maestra"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse args
DRY_RUN=false
STATUS_ONLY=false
for arg in "$@"; do
    case $arg in
        --dry-run)  DRY_RUN=true ;;
        --status)   STATUS_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--status] [--dry-run]"
            echo "  --status   Show which migrations have been applied"
            echo "  --dry-run  Show pending migrations without executing"
            exit 0
            ;;
    esac
done

# Detect docker compose command
if command -v docker-compose > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# Helper: run SQL in the postgres container
run_sql() {
    $DOCKER_COMPOSE exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

run_sql_quiet() {
    $DOCKER_COMPOSE exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -t -A "$@"
}

# Check postgres is running
if ! $DOCKER_COMPOSE exec -T postgres pg_isready -U "$DB_USER" > /dev/null 2>&1; then
    echo -e "${RED}Error: PostgreSQL is not running. Start it with 'make up' or 'make dev-db' first.${NC}"
    exit 1
fi

# Create migrations tracking table if it doesn't exist
run_sql <<'SQL' 2>/dev/null
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(255) PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

echo -e "${BLUE}Maestra Database Migrations${NC}"
echo "─────────────────────────────────"

# Show status
if $STATUS_ONLY; then
    echo ""
    echo -e "${BLUE}Applied migrations:${NC}"
    result=$(run_sql_quiet -c "SELECT version || '  ' || filename || '  (' || applied_at::text || ')' FROM schema_migrations ORDER BY version" 2>/dev/null || true)
    if [ -z "$result" ]; then
        echo "  (none)"
    else
        echo "$result" | while IFS= read -r line; do
            echo -e "  ${GREEN}✓${NC} $line"
        done
    fi
    echo ""

    echo -e "${BLUE}Pending migrations:${NC}"
    pending=0
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        [ -f "$migration_file" ] || continue
        filename=$(basename "$migration_file")
        version="${filename%%_*}"

        applied=$(run_sql_quiet -c "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'" 2>/dev/null || echo "0")
        if [ "$applied" = "0" ]; then
            echo -e "  ${YELLOW}○${NC} $filename"
            pending=$((pending + 1))
        fi
    done
    if [ "$pending" = "0" ]; then
        echo "  (none — database is up to date)"
    fi
    echo ""
    exit 0
fi

# Run pending migrations
applied=0
skipped=0
failed=0

for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration_file" ] || continue
    filename=$(basename "$migration_file")
    version="${filename%%_*}"

    # Check if already applied
    already_applied=$(run_sql_quiet -c "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'" 2>/dev/null || echo "0")

    if [ "$already_applied" != "0" ]; then
        skipped=$((skipped + 1))
        continue
    fi

    if $DRY_RUN; then
        echo -e "  ${YELLOW}○${NC} Would apply: $filename"
        applied=$((applied + 1))
        continue
    fi

    echo -ne "  Applying ${BLUE}$filename${NC}... "

    # Run the migration
    if cat "$migration_file" | run_sql > /dev/null 2>&1; then
        # Record it
        run_sql_quiet -c "INSERT INTO schema_migrations (version, filename) VALUES ('$version', '$filename')" > /dev/null 2>&1
        echo -e "${GREEN}done${NC}"
        applied=$((applied + 1))
    else
        echo -e "${RED}FAILED${NC}"
        echo -e "${RED}  Migration $filename failed. Database may be in an inconsistent state.${NC}"
        echo -e "${RED}  Fix the issue and re-run 'make migrate'.${NC}"
        echo ""
        echo "  To debug, run manually:"
        echo "    make shell-postgres"
        echo "    \\i /docker-entrypoint-initdb.d/../migrations/$filename"
        failed=$((failed + 1))
        break
    fi
done

echo ""
if $DRY_RUN; then
    echo -e "${YELLOW}Dry run complete.${NC} $applied migration(s) would be applied."
elif [ "$failed" -gt 0 ]; then
    echo -e "${RED}Migration failed.${NC} $applied applied, $failed failed, $skipped already up to date."
    exit 1
elif [ "$applied" -gt 0 ]; then
    echo -e "${GREEN}Done.${NC} $applied migration(s) applied, $skipped already up to date."
else
    echo -e "${GREEN}Database is up to date.${NC} $skipped migration(s) already applied."
fi
