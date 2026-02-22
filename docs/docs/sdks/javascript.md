# JavaScript/TypeScript SDK

## Installation

```bash
npm install @maestra/sdk
```

## Quick Start

```typescript
import { MaestraClient } from '@maestra/sdk';

const client = new MaestraClient({ apiUrl: 'http://localhost:8080' });

// Get entity
const entity = await client.getEntity('gallery-light-1');

// Read state
const brightness = entity.get('brightness', 0);

// Update state
await entity.updateState({ brightness: 75 });

// Subscribe to changes
entity.onStateChange((state, changedKeys) => {
  console.log('Changed:', changedKeys);
});
```

## Streams

```typescript
// Discover and consume streams
const streams = await client.getStreams('audio')

const offer = await client.requestStream(streams[0].id, {
  consumer_id: 'web-app',
  consumer_address: '192.168.1.70',
})
console.log(`Connect to ${offer.publisher_address}:${offer.publisher_port}`)

// Advertise a stream
const stream = await client.advertiseStream({
  name: 'Browser Audio',
  stream_type: 'audio',
  publisher_id: 'web-app',
  protocol: 'webrtc',
  address: '192.168.1.70',
  port: 0,
})
```

See [Streams Guide](../guides/streams.md) for lifecycle details and more examples.

See `sdks/js/README.md` for full documentation.
