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

See `sdks/js/README.md` for full documentation.
