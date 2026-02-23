# Streams API

The Streams API enables dynamic stream discovery, advertisement, negotiation, and session management. Publishers advertise high-bandwidth data streams (video, audio, sensor data, textures), consumers discover and request access, and Maestra brokers the connection while keeping actual data transfer peer-to-peer.

**Base URL:** `http://localhost:8080`

Interactive API docs: [http://localhost:8080/docs](http://localhost:8080/docs)

## Stream Types

```
GET    /streams/types              # List stream type definitions
POST   /streams/types              # Create custom stream type
```

### List Stream Types

```bash
curl http://localhost:8080/streams/types
```

Response:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "ndi",
    "display_name": "NDI Video",
    "description": "NDI video stream",
    "icon": "cast",
    "default_config": {"codec": "h264", "resolution": "1920x1080", "fps": 30},
    "metadata": {},
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
]
```

Built-in types: `ndi`, `audio`, `video`, `texture`, `sensor`, `osc`, `midi`, `data`, `srt`, `spout`, `syphon`

### Create Stream Type

```bash
curl -X POST http://localhost:8080/streams/types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lidar",
    "display_name": "LiDAR Point Cloud",
    "description": "3D point cloud data from LiDAR sensors",
    "icon": "scan",
    "default_config": {"format": "ply", "rate_hz": 10}
  }'
```

## Stream Discovery

```
GET    /streams                    # List active streams
GET    /streams/{stream_id}        # Get single stream
```

### List Active Streams

```bash
# All streams
curl http://localhost:8080/streams

# Filter by type
curl http://localhost:8080/streams?stream_type=ndi
```

Response:
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Main Stage Camera A",
    "stream_type": "ndi",
    "publisher_id": "td-workstation-01",
    "protocol": "ndi",
    "address": "192.168.1.50",
    "port": 5960,
    "entity_id": null,
    "device_id": null,
    "config": {"resolution": "1920x1080", "fps": 30},
    "metadata": {"location": "stage-left"},
    "advertised_at": "2025-01-15T10:30:00Z",
    "last_heartbeat": "2025-01-15T10:30:25Z",
    "active_sessions": 2
  }
]
```

### Get Single Stream

```bash
curl http://localhost:8080/streams/{stream_id}
```

Returns `404` if the stream has expired or been withdrawn.

## Stream Advertisement

```
POST   /streams/advertise              # Advertise a new stream
DELETE /streams/{stream_id}            # Withdraw a stream
POST   /streams/{stream_id}/heartbeat  # Refresh stream TTL
```

### Advertise a Stream

```bash
curl -X POST http://localhost:8080/streams/advertise \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Stage Camera A",
    "stream_type": "ndi",
    "publisher_id": "td-workstation-01",
    "protocol": "ndi",
    "address": "192.168.1.50",
    "port": 5960,
    "config": {"resolution": "1920x1080", "fps": 30},
    "metadata": {"location": "stage-left"}
  }'
```

**Required fields:** `name`, `stream_type`, `publisher_id`, `protocol`, `address`, `port`

**Optional fields:** `entity_id`, `device_id`, `config`, `metadata`

**Stream types:** `ndi`, `audio`, `video`, `texture`, `sensor`, `osc`, `midi`, `data`, `srt`, `spout`, `syphon`

**Protocols:** `tcp`, `udp`, `ndi`, `srt`, `webrtc`, `spout`, `syphon`, `shared_memory`

The stream is stored in Redis with a 30-second TTL. Publishers must send heartbeats to keep the stream alive.

### Withdraw a Stream

```bash
curl -X DELETE http://localhost:8080/streams/{stream_id}
```

Immediately removes the stream from the registry and cleans up any associated sessions.

### Stream Heartbeat

```bash
curl -X POST http://localhost:8080/streams/{stream_id}/heartbeat
```

Refreshes the stream's 30-second TTL. Call every ~10 seconds. Returns `404` if the stream has already expired.

## Stream Negotiation

```
POST   /streams/{stream_id}/request    # Request to consume a stream
```

### Request a Stream

This endpoint triggers a **NATS request-reply handshake** between the consumer and publisher:

1. Consumer calls this endpoint with their connection details
2. Fleet Manager sends a NATS request to `maestra.stream.request.{stream_id}` (5-second timeout)
3. Publisher receives the request and responds with connection details (or rejection)
4. Fleet Manager creates a session in Redis and logs it to Postgres
5. Consumer receives the `StreamOffer` with connection details for the data plane

```bash
curl -X POST http://localhost:8080/streams/{stream_id}/request \
  -H "Content-Type: application/json" \
  -d '{
    "consumer_id": "max-workstation-02",
    "consumer_address": "192.168.1.60",
    "consumer_port": 5961,
    "config": {"preferred_codec": "h264"}
  }'
```

Response (`201 Created`):
```json
{
  "session_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "stream_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stream_name": "Main Stage Camera A",
  "stream_type": "ndi",
  "protocol": "ndi",
  "publisher_address": "192.168.1.50",
  "publisher_port": 5960,
  "transport_config": {"ndi_name": "TD-01 (Camera A)"}
}
```

**Error responses:**
- `404` - Stream not found or expired
- `504` - Publisher did not respond within 5 seconds
- `502` - Publisher rejected the request or NATS error

## Session Management

```
GET    /streams/sessions                          # List active sessions
GET    /streams/sessions/history                  # Query historical sessions
DELETE /streams/sessions/{session_id}             # Stop a session
POST   /streams/sessions/{session_id}/heartbeat   # Refresh session TTL
```

### List Active Sessions

```bash
# All sessions
curl http://localhost:8080/streams/sessions

# Filter by stream
curl http://localhost:8080/streams/sessions?stream_id={stream_id}
```

Response:
```json
[
  {
    "session_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "stream_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "stream_name": "Main Stage Camera A",
    "stream_type": "ndi",
    "publisher_id": "td-workstation-01",
    "publisher_address": "192.168.1.50",
    "consumer_id": "max-workstation-02",
    "consumer_address": "192.168.1.60",
    "protocol": "ndi",
    "transport_config": {},
    "started_at": "2025-01-15T10:31:00Z",
    "status": "active"
  }
]
```

### Session History

Query historical session records from PostgreSQL (90-day retention):

```bash
curl "http://localhost:8080/streams/sessions/history?publisher_id=td-01&limit=20"
```

Query parameters: `stream_id`, `publisher_id`, `consumer_id`, `limit` (1-500, default 50)

### Stop a Session

```bash
curl -X DELETE http://localhost:8080/streams/sessions/{session_id}
```

### Session Heartbeat

```bash
curl -X POST http://localhost:8080/streams/sessions/{session_id}/heartbeat
```

Sessions have a 30-second TTL. Both publisher and consumer should send heartbeats every ~10 seconds.

## Full Registry State

```
GET    /streams/state              # Complete registry state
```

Returns all streams, sessions, and stream types in a single response. Used by the dashboard for real-time monitoring.

```bash
curl http://localhost:8080/streams/state
```

Response:
```json
{
  "streams": [...],
  "sessions": [...],
  "stream_types": [...]
}
```

## Related Documentation

- [Streams Guide](../guides/streams.md) - Concepts, lifecycle, and SDK examples
- [Fleet Manager API](fleet-manager.md) - Device registration and management
- [Entities API](entities.md) - Entity state management
