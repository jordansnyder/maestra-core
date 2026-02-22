# Monitoring Guide

Maestra includes comprehensive monitoring and observability through Grafana dashboards powered by TimescaleDB and PostgreSQL. Access Grafana at http://localhost:3000 (default credentials: admin/admin).

## Available Dashboards

Maestra includes 8 pre-configured dashboards for monitoring different aspects of the system:

### 1. System Health

**Dashboard**: Maestra - System Health
**File**: `config/grafana/dashboards/system-health.json`

Monitors overall infrastructure health:
- Docker container status and resource usage
- CPU, memory, and disk utilization
- Network throughput
- Service uptime and availability
- Database connection pool status

**Key Metrics**:
- Container CPU % and memory usage
- PostgreSQL active connections
- NATS server connections
- Redis memory usage
- Disk I/O statistics

**Use Cases**:
- Identify resource bottlenecks
- Monitor service availability
- Troubleshoot performance issues
- Capacity planning

### 2. Device Overview

**Dashboard**: Device Overview (legacy)
**File**: `config/grafana/dashboards/device-overview.json`

Fleet-level device monitoring:
- Total registered devices
- Online vs offline status
- Device registration rate
- Heartbeat frequency
- Geographic distribution (if location data available)

**Key Metrics**:
- Device count by type
- Heartbeat intervals
- Last seen timestamps
- Status changes over time

### 3. Entity State

**Dashboard**: Maestra - Entity State
**File**: `config/grafana/dashboards/entity-state.json`

Real-time entity state monitoring:
- Current entity states
- State change frequency
- State history and trends
- Entity hierarchy visualization
- Variable value tracking

**Key Metrics**:
- State changes per minute
- Entity count by type
- JSONB field extraction for specific keys
- State change patterns

**Query Examples**:
```sql
-- Recent state changes
SELECT
  time,
  entity_id,
  state->>'brightness' as brightness,
  source
FROM entity_states
WHERE time > NOW() - INTERVAL '1 hour'
ORDER BY time DESC;

-- State aggregation
SELECT
  time_bucket('5 minutes', time) AS bucket,
  entity_id,
  AVG((state->>'temperature')::float) as avg_temp
FROM entity_states
WHERE state ? 'temperature'
GROUP BY bucket, entity_id
ORDER BY bucket DESC;
```

### 4. Events & Debug

**Dashboard**: Maestra - Events & Debug
**File**: `config/grafana/dashboards/events-debug.json`

Event log analysis and debugging:
- Event frequency by type
- Error rate trends
- Event source distribution
- Log level breakdown
- Recent error messages

**Key Metrics**:
- Events per minute by severity
- Error rate over time
- Top error messages
- Event source distribution

**Alerting Use Cases**:
- Alert on error rate spikes
- Notify on critical events
- Track warning patterns
- Monitor event processing lag

### 5. Message Bus Metrics

**Dashboard**: Maestra - Message Bus (NATS/MQTT)
**File**: `config/grafana/dashboards/message-bus.json`

NATS and MQTT broker monitoring:
- Message throughput (msgs/sec)
- Subject/topic distribution
- Client connections
- Message latency
- Queue depth
- Subscription patterns

**Key Metrics**:
- NATS messages in/out per second
- MQTT publish/subscribe counts
- Active subscriptions
- Message routing patterns
- Bridge performance (MQTT ↔ NATS)

**Performance Indicators**:
- High throughput scenarios (>1000 msgs/sec)
- Subscription overhead
- Message buffer sizes
- Connection churn rate

### 6. Performance Metrics

**Dashboard**: Maestra - Performance Metrics
**File**: `config/grafana/dashboards/performance-metrics.json`

Application and API performance:
- Fleet Manager API response times
- Database query performance
- Endpoint latency by route
- Request rate and error rate
- Slow query identification

**Key Metrics**:
- P50, P95, P99 response times
- Requests per second by endpoint
- Database query execution time
- Cache hit/miss ratio (Redis)
- API error rate

**Optimization Targets**:
- API responses < 100ms (P95)
- Database queries < 50ms
- Cache hit rate > 80%

### 7. SDK Connections

**Dashboard**: Maestra - SDK Connections
**File**: `config/grafana/dashboards/sdk-connections.json`

Client SDK and gateway monitoring:
- WebSocket connections
- OSC message throughput
- MQTT client sessions
- SDK version distribution
- Connection duration
- Message patterns by client

**Key Metrics**:
- Active WebSocket clients
- OSC messages received/sent per second
- MQTT client connections by protocol version
- Gateway message latency
- Client reconnection rate

### 8. Experiences & Flows

**Dashboard**: Maestra - Experiences & Flows
**File**: `config/grafana/dashboards/experiences-flows.json`

Node-RED and experience monitoring:
- Active flows
- Flow execution time
- Node-RED CPU/memory usage
- Flow trigger frequency
- Experience state transitions

**Key Metrics**:
- Flow deployments over time
- Node execution counts
- Flow runtime errors
- Message processing in Node-RED

## Creating Custom Dashboards

### Connecting to Data Source

Grafana is pre-configured with the PostgreSQL (TimescaleDB) data source.

1. Navigate to **Dashboards → New Dashboard**
2. Add a new panel
3. Select **PostgreSQL** as the data source
4. Write your query

### Example Queries

**Entity state history:**
```sql
SELECT
  time as "time",
  entity_id,
  state
FROM entity_states
WHERE
  $__timeFilter(time)
  AND entity_id = $entity_id
ORDER BY time
```

**Message throughput:**
```sql
SELECT
  time_bucket('1 minute', created_at) AS "time",
  COUNT(*) as "messages"
FROM device_events
WHERE $__timeFilter(created_at)
GROUP BY 1
ORDER BY 1
```

**Device metrics with JSONB extraction:**
```sql
SELECT
  time,
  device_id,
  (metrics->>'cpu_percent')::float as cpu_percent,
  (metrics->>'memory_used')::bigint as memory_bytes
FROM device_metrics
WHERE
  $__timeFilter(time)
  AND metrics ? 'cpu_percent'
ORDER BY time DESC
```

**Continuous aggregate query:**
```sql
SELECT
  bucket as "time",
  device_id,
  avg_cpu,
  max_memory
FROM device_metrics_hourly
WHERE $__timeFilter(bucket)
ORDER BY bucket DESC
```

## TimescaleDB Features

### Hypertables

Maestra uses TimescaleDB hypertables for time-series data:

- **device_metrics** - 90-day retention, automatic compression
- **device_events** - 30-day retention
- **entity_states** - State change history with automatic partitioning

### Continuous Aggregates

Pre-computed aggregates for faster queries:

- **device_metrics_hourly** - 1-year retention
- **device_metrics_daily** - 5-year retention
- Auto-refresh every 5 minutes

Query continuous aggregates for historical data:

```sql
-- Query hourly aggregate instead of raw data
SELECT * FROM device_metrics_hourly
WHERE bucket > NOW() - INTERVAL '7 days';
```

### JSONB Field Extraction

Extract nested fields from JSONB columns:

```sql
-- Simple field
state->>'brightness'

-- Nested field
state->'position'->>'x'

-- Cast to numeric
(state->>'temperature')::float

-- Check field exists
state ? 'brightness'

-- Multiple field check
state ?& array['x', 'y', 'z']
```

## Alerting Configuration

### Email Alerts

1. Navigate to **Alerting → Contact points**
2. Add new contact point with email
3. Configure SMTP in Grafana settings

**SMTP Configuration** (`config/grafana/grafana.ini`):
```ini
[smtp]
enabled = true
host = smtp.gmail.com:587
user = your-email@gmail.com
password = your-app-password
from_address = grafana@maestra.local
```

### Alert Rules

Create alerts from dashboard panels:

1. Edit a panel
2. Click **Alert** tab
3. Configure conditions:
   - **WHEN** last() **OF** query(A, 5m) **IS ABOVE** 80
   - Evaluate every 1m for 5m

**Example Alerts**:

**High Error Rate:**
```
Query: SELECT COUNT(*) FROM device_events WHERE severity = 'error' AND time > NOW() - INTERVAL '5 minutes'
Condition: IS ABOVE 10
```

**Device Offline:**
```
Query: SELECT COUNT(*) FROM devices WHERE status = 'offline' AND last_heartbeat < NOW() - INTERVAL '5 minutes'
Condition: IS ABOVE 0
```

**High API Latency:**
```
Query: SELECT AVG(duration_ms) FROM api_requests WHERE time > NOW() - INTERVAL '5 minutes'
Condition: IS ABOVE 1000
```

### Slack Integration

1. Create Slack webhook URL
2. Add Slack contact point in Grafana
3. Assign to alert rules

## Dashboard Variables

Use variables for dynamic filtering:

1. **Dashboard settings → Variables → Add variable**
2. Create variable from query:

**Entity ID variable:**
```sql
SELECT DISTINCT entity_id FROM entity_states ORDER BY entity_id
```

**Device Type variable:**
```sql
SELECT DISTINCT type FROM devices ORDER BY type
```

Use in queries: `WHERE entity_id = $entity_id`

## Performance Optimization

### Query Optimization Tips

1. **Use time filters**: Always include `$__timeFilter(time)` for time-series queries
2. **Limit results**: Add `LIMIT` clauses to large result sets
3. **Use aggregates**: Query `device_metrics_hourly` instead of raw `device_metrics` for historical data
4. **Index properly**: Ensure indexes exist on frequently queried columns
5. **Avoid SELECT ***: Only select needed columns

### Dashboard Best Practices

1. **Set refresh interval**: Use 5s-30s for real-time, 5m+ for historical
2. **Limit time range**: Default to last 6 hours or 24 hours
3. **Use templates**: Create reusable dashboard templates
4. **Panel caching**: Enable query caching for expensive queries
5. **Pagination**: Use pagination for large tables

## Troubleshooting

### Dashboard Not Loading

```bash
# Check Grafana logs
make logs-service SERVICE=grafana

# Verify PostgreSQL connection
docker exec -it maestra-postgres psql -U maestra -d maestra
```

### No Data in Panels

1. Verify time range includes data
2. Check data source connection (Grafana settings)
3. Test query in **Explore** view
4. Ensure devices are sending data

### Slow Queries

1. Check query execution time in PostgreSQL:
```sql
SELECT * FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
```

2. Use `EXPLAIN ANALYZE` to understand query plan
3. Add missing indexes
4. Use continuous aggregates for historical data

### Database Connection Errors

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
docker exec -it maestra-postgres pg_isready

# Check connection limits
docker exec -it maestra-postgres psql -U maestra -c "SHOW max_connections;"
```

## Exporting Dashboards

### Export Dashboard JSON

1. Open dashboard
2. **Dashboard settings → JSON Model**
3. Copy JSON
4. Save to `config/grafana/dashboards/`

### Import Dashboard

1. **Dashboards → Import**
2. Upload JSON file or paste JSON
3. Select data source
4. Click **Import**

## Production Monitoring

### Recommended Alerts

- **System Health**: CPU/Memory > 80% for 5 minutes
- **Database**: Connection pool exhaustion
- **API Performance**: P95 response time > 500ms
- **Message Bus**: NATS/MQTT connection drops
- **Devices**: Heartbeat failures > 10% of fleet
- **Errors**: Error rate spike (> 10 errors/minute)

### Monitoring Checklist

- [ ] All 8 dashboards reviewed and customized
- [ ] Alert rules configured for critical metrics
- [ ] Contact points set up (email, Slack)
- [ ] Dashboard refresh intervals optimized
- [ ] Database retention policies confirmed
- [ ] Continuous aggregates validated
- [ ] Historical data queries use aggregates
- [ ] Custom dashboards for specific use cases

## Related Documentation

- [Fleet Manager API](../api/fleet-manager.md) - API endpoints for metrics and events
- [Architecture Overview](../architecture/overview.md) - System architecture
- [Infrastructure](../infrastructure/docker.md) - Docker and infrastructure details
