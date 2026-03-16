# Web / React / Mobile

Connect browser-based apps, React projects, or Node.js services to Maestra.

## What you need

- **Node.js** (for npm) or a modern web browser
- **The Maestra server address** — ask your technical director or admin (e.g., `http://192.168.1.10:8080` for the API, `ws://192.168.1.10:8765` for real-time updates)

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, the addresses are `http://localhost:8080` and `ws://localhost:8765`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Install the SDK

```bash
npm install @maestra/sdk
```

## Step 2: Connect and read state

```typescript
import { MaestraClient } from '@maestra/sdk'

const client = new MaestraClient({
  apiUrl: 'http://192.168.1.10:8080',    // Your Maestra address
  wsUrl: 'ws://192.168.1.10:8765',
})
await client.connect()

// Get an entity and read its state
const light = await client.getEntityBySlug('gallery-light-1')
console.log('Brightness:', light.state.get('brightness'))

// Listen for live updates from other devices
light.state.onChange((event) => {
  console.log('State changed:', event.current_state)
})
await light.subscribe()
```

## Step 3: Send updates

```typescript
// Update a single value
await light.state.update({ brightness: 75 })

// Update multiple values at once
await light.state.update({ brightness: 75, color: '#ff9900' })
```

## React hook

Here's a simple hook to use Maestra in a React app:

```javascript
import { useEffect, useState } from 'react';

export function useMaestra(wsUrl) {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);
    socket.onmessage = (e) => {
      setMessages(prev => [...prev, JSON.parse(e.data)]);
    };
    setWs(socket);
    return () => socket.close();
  }, [wsUrl]);

  const publish = (subject, data) => {
    ws?.send(JSON.stringify({ type: 'publish', subject, data }));
  };

  return { messages, publish };
}
```

## Using plain WebSocket (no SDK)

If you don't want to install the SDK, you can use a raw WebSocket connection:

```javascript
const ws = new WebSocket('ws://192.168.1.10:8765');

ws.onopen = () => {
  // Subscribe to an entity
  ws.send(JSON.stringify({
    type: 'subscribe',
    subject: 'maestra.entity.state.>'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Update:', message.data);
};
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — discover and consume video/audio streams
- [JavaScript SDK Reference](../sdks/javascript.md) — full API details
- [Web SDK Reference](../sdks/web.md) — WebSocket and MQTT browser patterns
