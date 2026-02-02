# Web SDK Guide

Integrate Maestra with web applications using WebSocket or MQTT over WebSocket.

## WebSocket Integration

See [WebSocket Gateway API](../api/websocket.md) for complete documentation.

### Quick Start

```javascript
const ws = new WebSocket('ws://localhost:8765');

ws.onopen = () => {
  // Publish message
  ws.send(JSON.stringify({
    type: 'publish',
    subject: 'maestra.web.event',
    data: { value: 42 }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'message') {
    console.log(message.data);
  }
};
```

### React Hook

```javascript
import { useEffect, useState } from 'react';

export function useMaestra() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8765');
    socket.onmessage = (e) => {
      setMessages(prev => [...prev, JSON.parse(e.data)]);
    };
    setWs(socket);
    return () => socket.close();
  }, []);

  const publish = (subject, data) => {
    ws?.send(JSON.stringify({ type: 'publish', subject, data }));
  };

  return { messages, publish };
}
```

## MQTT over WebSocket

```javascript
import mqtt from 'mqtt';

const client = mqtt.connect('ws://localhost:9001');

client.on('connect', () => {
  client.subscribe('maestra/devices/#');
  client.publish('maestra/web/status', 'online');
});

client.on('message', (topic, message) => {
  console.log(`${topic}: ${message.toString()}`);
});
```

## Related Documentation

- [WebSocket Gateway API](../api/websocket.md) - Full API reference
- [MQTT Integration](../guides/mqtt.md) - MQTT protocol guide
- [Fleet Manager API](../api/fleet-manager.md) - REST API
