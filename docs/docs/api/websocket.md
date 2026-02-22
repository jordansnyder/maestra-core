# WebSocket Gateway API

The WebSocket Gateway provides real-time bidirectional communication between web browsers and the Maestra message bus (NATS). It runs on port 8765 and allows web applications to publish and subscribe to NATS topics.

## Connection

```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.onopen = () => {
  console.log('Connected to Maestra WebSocket Gateway');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

## Message Format

All messages use JSON with the following envelope structure:

```json
{
  "type": "message_type",
  "subject": "nats.topic.name",
  "data": {},
  "timestamp": "2026-02-02T12:34:56.789Z"
}
```

## Message Types

### Welcome (Server → Client)

Sent immediately after connection:

```json
{
  "type": "welcome",
  "client_id": 140234567890,
  "timestamp": "2026-02-02T12:34:56.789Z",
  "message": "Connected to Maestra WebSocket Gateway"
}
```

### Publish (Client → Server)

Publish a message to a NATS subject:

```javascript
ws.send(JSON.stringify({
  type: 'publish',
  subject: 'maestra.test.hello',
  data: {
    message: 'Hello from browser',
    value: 42
  }
}));
```

Server responds with acknowledgment:

```json
{
  "type": "ack",
  "subject": "maestra.test.hello",
  "timestamp": "2026-02-02T12:34:56.789Z"
}
```

### Message (Server → Client)

Incoming messages from subscribed NATS topics:

```json
{
  "type": "message",
  "subject": "maestra.devices.sensor1.temperature",
  "data": {
    "temperature": 23.5,
    "unit": "celsius"
  },
  "timestamp": "2026-02-02T12:34:56.789Z"
}
```

### Ping/Pong

Keep connection alive:

```javascript
// Send ping
ws.send(JSON.stringify({ type: 'ping' }));

// Receive pong
{
  "type": "pong",
  "timestamp": "2026-02-02T12:34:56.789Z"
}
```

### Error (Server → Client)

Error response:

```json
{
  "type": "error",
  "message": "Invalid JSON",
  "timestamp": "2026-02-02T12:34:56.789Z"
}
```

## Subscriptions

The gateway automatically subscribes to **all** NATS topics matching `maestra.>` (wildcard). All messages published to any `maestra.*` topic will be broadcast to all connected WebSocket clients.

### Filtering Messages

Since all messages are broadcast, filter them client-side:

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'message') {
    // Filter by subject pattern
    if (message.subject.startsWith('maestra.devices.')) {
      handleDeviceMessage(message);
    }
  }
};
```

## NATS Wildcard Patterns

When publishing to NATS from other services, messages will reach WebSocket clients:

- `maestra.devices.sensor1.temperature` - Specific device
- `maestra.devices.*.temperature` - All devices (using `*` for single level)
- `maestra.devices.>` - All device topics (using `>` for multiple levels)

## Integration Examples

### React Hook

```javascript
import { useEffect, useState } from 'react';

export function useMaestraWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8765');

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, message]);
    };

    setWs(socket);

    return () => socket.close();
  }, []);

  const publish = (subject, data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'publish', subject, data }));
    }
  };

  return { messages, publish };
}
```

### Vue.js Composable

```javascript
import { ref, onMounted, onUnmounted } from 'vue';

export function useMaestraWebSocket() {
  const messages = ref([]);
  let ws = null;

  onMounted(() => {
    ws = new WebSocket('ws://localhost:8765');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      messages.value.push(message);
    };
  });

  onUnmounted(() => {
    ws?.close();
  });

  const publish = (subject, data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'publish', subject, data }));
    }
  };

  return { messages, publish };
}
```

### Plain JavaScript

```javascript
class MaestraWebSocket {
  constructor(url = 'ws://localhost:8765') {
    this.ws = new WebSocket(url);
    this.handlers = new Map();

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  // Subscribe to specific subject patterns
  on(subjectPattern, callback) {
    this.handlers.set(subjectPattern, callback);
  }

  handleMessage(message) {
    if (message.type === 'message') {
      // Check if subject matches any handler patterns
      for (const [pattern, callback] of this.handlers) {
        if (this.matchSubject(message.subject, pattern)) {
          callback(message.data, message.subject);
        }
      }
    }
  }

  matchSubject(subject, pattern) {
    // Simple pattern matching (* for single level, > for all remaining)
    const subjectParts = subject.split('.');
    const patternParts = pattern.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '>') return true;
      if (patternParts[i] === '*') continue;
      if (subjectParts[i] !== patternParts[i]) return false;
    }

    return subjectParts.length === patternParts.length;
  }

  publish(subject, data) {
    this.ws.send(JSON.stringify({ type: 'publish', subject, data }));
  }

  close() {
    this.ws.close();
  }
}

// Usage
const maestra = new MaestraWebSocket();

maestra.on('maestra.devices.*.temperature', (data, subject) => {
  console.log(`${subject}: ${data.temperature}°C`);
});

maestra.publish('maestra.control.lights', { on: true });
```

## Security Considerations

**Development Mode**: The WebSocket Gateway has no authentication in development mode. All connected clients can publish and receive all messages.

**Production Recommendations**:
- Add authentication (JWT tokens, API keys)
- Implement per-client subscriptions instead of broadcast-all
- Add rate limiting to prevent abuse
- Use WSS (WebSocket Secure) with TLS/SSL
- Add CORS configuration
- Implement message size limits

## Performance Notes

- The gateway can handle multiple concurrent WebSocket connections
- All messages are broadcast to all connected clients (client-side filtering recommended)
- Messages are JSON-encoded (consider binary formats for high-throughput use cases)
- WebSocket connections are persistent (low latency compared to HTTP polling)

## Troubleshooting

### Connection Issues

```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
  // Implement reconnection logic
};
```

### Message Not Received

1. Check that the NATS subject starts with `maestra.`
2. Verify WebSocket connection is open (`ws.readyState === WebSocket.OPEN`)
3. Check browser console for JSON parsing errors
4. Ensure NATS message is published correctly from other services

### Gateway Not Running

```bash
# Check if gateway container is running
docker ps | grep websocket-gateway

# View gateway logs
make logs-service SERVICE=websocket-gateway

# Restart gateway
docker compose restart websocket-gateway
```

## Related Documentation

- [Fleet Manager API](fleet-manager.md) - REST API for entity management
- [OSC Gateway](osc.md) - OSC protocol gateway for creative tools
- [Web SDK Guide](../sdks/web.md) - Complete web SDK documentation
