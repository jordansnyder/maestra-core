# Maestra TouchDesigner Integration

Connect TouchDesigner to the Maestra platform for real-time state synchronization.

## Installation

1. Copy `MaestraExt.py` to your project's `scripts` folder
2. Create a Base COMP and add the extension
3. Configure OSC In DAT for real-time updates

## Quick Start

### Using the Extension

```python
# In your TouchDesigner project
maestra = op('maestra').ext.MaestraExt

# Initialize with entity slug
maestra.Initialize('room-a-light-1', 'http://localhost:8080')

# Get current state
brightness = maestra.Get('brightness', 0)
color = maestra.State.get('color', '#ffffff')

# Update state
maestra.UpdateState({'brightness': 75, 'color': '#ff0000'})

# Replace entire state
maestra.SetState({'brightness': 0, 'active': False})
```

### OSC Integration

Set up an OSC In DAT to receive real-time state changes:

- **Port**: 57121
- **Network Protocol**: UDP

Configure the OSC gateway to send to your TouchDesigner instance.

### Parameter Expressions

Reference state values in parameter expressions:

```python
# In a parameter expression
op('maestra').ext.MaestraExt.Get('brightness', 0) / 100
```

### CHOP Integration

Create a Script CHOP that outputs state values:

```python
def onCook(scriptOp):
    state = op('maestra').ext.MaestraExt.State

    scriptOp.clear()
    scriptOp.appendChan('brightness')[0] = state.get('brightness', 0)
    scriptOp.appendChan('active')[0] = 1 if state.get('active', False) else 0
```

## State Change Callbacks

Create a Text DAT named `on_state_change` with callback code:

```python
def onStateChange(state):
    print(f"State changed: {state}")

    # Update visuals
    op('level1').par.opacity = state.get('brightness', 100) / 100
```

## Example Network

```
[OSC In DAT] → [Script] → [MaestraExt Base]
                              ↓
                         [state_table DAT]
                              ↓
                    [Your Visual Network]
```

## API Reference

### MaestraExt Properties

| Property | Type | Description |
|----------|------|-------------|
| `State` | dict | Current entity state |
| `EntitySlug` | str | Entity slug identifier |

### MaestraExt Methods

| Method | Description |
|--------|-------------|
| `Initialize(slug, api_url)` | Connect to entity |
| `Get(key, default)` | Get state value |
| `UpdateState(updates)` | Merge state updates |
| `SetState(new_state)` | Replace entire state |
| `OnOscMessage(address, *args)` | Handle OSC input |

## License

MIT
