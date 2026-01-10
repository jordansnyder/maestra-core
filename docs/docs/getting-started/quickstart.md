# Quick Start

This guide will help you create your first entity and interact with it using the API.

## Create an Entity

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

## Get Entity State

```bash
curl http://localhost:8080/entities/by-slug/gallery-light-1/state
```

## Update State

```bash
# Partial update (merge)
curl -X PATCH http://localhost:8080/entities/YOUR_ENTITY_ID/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {"brightness": 50},
    "source": "api"
  }'
```

## Using the Dashboard

1. Open http://localhost:3001
2. Click "Entities" in Quick Access
3. Click "+ Create Entity"
4. Fill in the form and click "Create"

## Subscribe to State Changes

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

- [API Reference](../api/fleet-manager.md)
- [SDK Documentation](../sdks/overview.md)
- [Architecture Overview](../architecture/overview.md)
