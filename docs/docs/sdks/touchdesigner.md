# TouchDesigner Integration

## Installation

### Option A: COMP Builder (Recommended)

Run the builder script to create a fully-configured Maestra COMP:

1. In TouchDesigner, create a **Text DAT**
2. Set its file path to `sdks/touchdesigner/build_maestra_tox.py`, or paste its contents
3. Right-click the DAT → **Run Script**
4. A `maestra` COMP is created at `/project1/maestra`

### Option B: Manual Setup

1. Copy `MaestraExt.py` to your project's `scripts` folder
2. Create a Base COMP and add the extension

## Quick Start (No-Code)

1. Open the `maestra` COMP's custom parameters
2. Set **Entity Slug** to your entity name (e.g., `gallery-light-1`)
3. Click **Connect** — state appears in `state_table` and `state_chop`
4. Wire any CHOP into `state_in` — channel names become state keys, values auto-sync

## Quick Start (Scripting)

```python
# Access the extension
m = op('/project1/maestra').op('maestra_ext').module
ext = m.get_ext(op('/project1/maestra'))

# Initialize
ext.Initialize('gallery-light-1', 'http://localhost:8080')

# Get state
brightness = ext.Get('brightness', 0)

# Update state (merge)
ext.UpdateState({'brightness': 75})

# Replace entire state
ext.SetState({'brightness': 100, 'color': '#ff0000'})
```

## CHOP State Input

Wire any CHOP output into the `state_in` operator inside the COMP. Channel names become state keys, values auto-sync to Maestra.

```
[Slider CHOP "brightness"]  ──┐
[LFO CHOP "speed"]          ──┼──▶  state_in  ──▶  Maestra API
[Audio CHOP "level"]         ──┘
```

**State Input parameters:**

| Parameter | Description |
|-----------|-------------|
| Max Updates/sec | Rate limiter (default 10) |
| Auto-Send on Change | Toggle auto-sync |
| Send State Now | Manual push button |

## Real-Time Updates

The COMP automatically connects to the WebSocket gateway for real-time state change notifications. When another device updates the entity state, it appears immediately in `state_table` and `state_chop`.

## Streams

```python
# Advertise a Syphon texture output
stream = ext.AdvertiseStream(
    name='Stage Visuals',
    stream_type='syphon',
    protocol='syphon',
    address='127.0.0.1',
    port=0,
)

# Discover available streams
streams = ext.ListStreams(stream_type='ndi')

# Heartbeat is handled automatically by the built-in timer
```

See [Streams Guide](../guides/streams.md) for full stream lifecycle documentation.

See `sdks/touchdesigner/README.md` for full documentation.
