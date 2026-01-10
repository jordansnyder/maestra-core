# Python SDK

## Installation

```bash
pip install maestra
```

## Quick Start

```python
import asyncio
from maestra import MaestraClient

async def main():
    client = MaestraClient("http://localhost:8080")
    await client.connect()

    # Get entity
    entity = await client.get_entity("gallery-light-1")

    # Read state
    brightness = entity.state.get("brightness", 0)

    # Update state
    await entity.update_state({"brightness": 75})

    # Subscribe to changes
    entity.on_state_change(lambda state, keys: print(f"Changed: {keys}"))

asyncio.run(main())
```

See `sdks/python/README.md` for full documentation.
