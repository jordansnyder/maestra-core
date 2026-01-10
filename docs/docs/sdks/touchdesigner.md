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

See `sdks/touchdesigner/README.md` for full documentation.
