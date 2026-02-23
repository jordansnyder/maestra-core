# TouchDesigner Integration

## Installation

1. Copy `MaestraExt.py` to your project's `scripts` folder
2. Create a Base COMP and add the extension

## Quick Start

```python
maestra = op('maestra').ext.MaestraExt

# Initialize
maestra.Initialize('gallery-light-1', 'http://localhost:8080')

# Get state
brightness = maestra.Get('brightness', 0)

# Update state
maestra.UpdateState({'brightness': 75})
```

## Streams

```python
# Advertise a Syphon texture output
stream = maestra.AdvertiseStream(
    name='Stage Visuals',
    stream_type='syphon',
    protocol='syphon',
    address='127.0.0.1',
    port=0,
)

# Discover available streams
streams = maestra.ListStreams(stream_type='ndi')

# Use a Timer CHOP to call heartbeat every 10s
maestra.StreamHeartbeat(stream['id'])
```

See [Streams Guide](../guides/streams.md) for full stream lifecycle documentation.

See `sdks/touchdesigner/README.md` for full documentation.
