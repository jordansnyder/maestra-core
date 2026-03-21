# Quick Start (Admin)

!!! tip "Are you an artist connecting to an existing Maestra?"
    You don't need this page. Head to [Connect Your Tool](../connect/touchdesigner.md) instead. This page is for **admins** who have just [installed Maestra](installation.md) and want to test it.

This guide walks you through creating your first entity and verifying that Maestra is working.

## Create an entity from the Dashboard

The easiest way to get started:

1. Open [http://localhost:3001](http://localhost:3001)
2. Click **Entities** in Quick Access
3. Click **+ Create Entity**
4. Enter a name (e.g., "Gallery Light 1") and click **Create**

Your entity now exists and is ready for any connected device to read and write to.

## Create an entity from the API

If you prefer the command line:

```bash
curl -X POST http://localhost:8080/entities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gallery Light 1",
    "entity_type_id": "YOUR_ACTUATOR_TYPE_ID",
    "state": {
      "brightness": 100,
      "color": "#ffffff",
      "on": true
    }
  }'
```

## Read entity state

```bash
curl http://localhost:8080/entities/by-slug/gallery-light-1/state
```

## Update entity state

```bash
curl -X PATCH http://localhost:8080/entities/YOUR_ENTITY_ID/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {"brightness": 50},
    "source": "api"
  }'
```

## Test with an SDK

### Python

```python
from maestra import MaestraClient

client = MaestraClient("http://localhost:8080")
await client.connect()

entity = await client.get_entity("gallery-light-1")
entity.on_state_change(lambda state, keys: print(f"Changed: {keys}"))
```

### JavaScript

```javascript
import { MaestraClient } from '@maestra/sdk';

const client = new MaestraClient({ apiUrl: 'http://localhost:8080' });
const entity = await client.getEntity('gallery-light-1');

entity.onStateChange((state, changedKeys) => {
  console.log('Changed:', changedKeys);
});
```

## Next Steps

- [Connect Your Tool](../connect/touchdesigner.md) — get your team's creative tools connected
- [Entities API Reference](../api/entities.md) — full API documentation
- [SDK Reference](../sdks/overview.md) — detailed SDK documentation
- [Core Concepts](../concepts/entities.md) — understand entities, streams, and routing
