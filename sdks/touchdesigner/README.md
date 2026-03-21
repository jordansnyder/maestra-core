# Maestra TouchDesigner Integration

Connect TouchDesigner to the Maestra platform for real-time entity state and stream management.

## Quick Start (No Code)

### 1. Create the Maestra COMP

Copy `build_maestra_tox.py` somewhere accessible (e.g., your project folder or Desktop), then run it using one of these methods:

**Option A — Textport one-liner** (Alt+P / Opt+P to open textport):

```python
exec(open('/path/to/build_maestra_tox.py').read())
```

**Option B — Text DAT:**

1. Create a Text DAT anywhere in your project
2. Paste the contents of `build_maestra_tox.py` into it
3. Right-click the DAT > **Run Script**

**Option C — File DAT:**

1. Create a File DAT, set its file path to `build_maestra_tox.py`
2. Right-click > **Run Script**

This creates a fully-configured `maestra` Base COMP at `/project1/maestra`.

### 2. Connect to an Entity

1. Select the `maestra` COMP and open the **Connection** parameter page
2. Set **Entity Slug** to your entity name (e.g., `room-a-light-1`)
3. Set **API URL** to your Maestra server (default: `http://localhost:8080`)
4. Click **Connect**

State values immediately appear in:
- **state_table** — Table DAT with key/value/type columns
- **state_chop** — Script CHOP with numeric values as channels

### 3. Use State in Your Network

Reference state values in parameter expressions:

```python
# Get the Maestra extension
m = op('maestra').op('maestra_ext').module
ext = m.get_ext(op('maestra'))

# Brightness as a 0-1 float
ext.Get('brightness', 0) / 100

# Dictionary-style access
ext['color']
```

Or wire the `state_chop` CHOP directly into your visual network.

### 4. Save as .tox (Optional)

Once configured, right-click the COMP > **Save Component .tox** to reuse it across projects. Or from the textport:

```python
op('/project1/maestra').save('Maestra.tox')
```

## Auto-Discovery

Enable **Use mDNS Discovery** in the Connection page to automatically find the Maestra server on your local network without entering the API URL manually. Requires the `zeroconf` package:

```
pip install zeroconf
```

## Streams

The **Streams** parameter page lets you advertise and withdraw streams (NDI, Syphon, Spout, etc.) without code:

1. Set **Stream Name**, **Stream Type**, **Protocol**, **Address**, and **Port**
2. Click **Advertise Stream**
3. The COMP auto-sends heartbeats every 10 seconds to keep the stream alive
4. Click **Withdraw Stream** to remove it

## Custom Parameters Reference

### Connection Page

| Parameter | Type | Description |
|-----------|------|-------------|
| API URL | String | Fleet Manager URL (default: `http://localhost:8080`) |
| Entity Slug | String | Entity to bind to |
| Auto-Connect on Start | Toggle | Connect automatically when project opens |
| Connect | Pulse | Connect to entity |
| Disconnect | Pulse | Disconnect and clear state |
| Use mDNS Discovery | Toggle | Auto-discover server on LAN |
| Discovery Timeout | Float | mDNS timeout in seconds (default: 5) |

### Status Page (Read-Only)

| Parameter | Type | Description |
|-----------|------|-------------|
| Connected | Toggle | Connection status |
| Entity ID | String | Resolved entity UUID |
| Last Update | String | Timestamp of last state change |
| Status | String | Human-readable status message |

### Streams Page

| Parameter | Type | Description |
|-----------|------|-------------|
| Stream Name | String | Name for your stream |
| Stream Type | Menu | NDI, Syphon, Spout, Video, Audio, Texture, Sensor, OSC, MIDI, Data, SRT |
| Protocol | String | Protocol identifier |
| Address | String | Stream endpoint address |
| Port | Int | Stream endpoint port |
| Advertise Stream | Pulse | Register stream with Maestra |
| Withdraw Stream | Pulse | Remove stream from registry |

## Internal Operators

| Operator | Type | Purpose |
|----------|------|---------|
| `maestra_ext` | Text DAT | Extension class (module with cached `get_ext()`) |
| `param_handler` | Parameter Execute DAT | Routes pulse/value changes to extension |
| `MaestraDiscovery` | Text DAT | mDNS discovery module |
| `state_table` | Table DAT | Key/value state output |
| `state_chop` | Script CHOP | Numeric state as CHOP channels |
| `osc_in` | OSC In DAT | Receives real-time state updates (port 57121) |
| `osc_script` | DAT Execute | Routes OSC to extension |
| `timer` | Timer CHOP | 10s heartbeat cycle |
| `timer_callback` | CHOP Execute | Triggers stream heartbeats |
| `callbacks` | Text DAT | User-editable `onStateChange(state)` |
| `info` | Text DAT | Log/status messages |

## State Change Callbacks

Edit the `callbacks` Text DAT inside the COMP to react to state changes:

```python
def onStateChange(state):
    op('level1').par.opacity = state.get('brightness', 100) / 100
    r, g, b = state.get('color', [1, 1, 1])
    op('constant1').par.colorr = r
    op('constant1').par.colorg = g
    op('constant1').par.colorb = b
```

## Scripting API

For advanced users, the full Python API is available:

```python
# Get the extension (cached — safe to call repeatedly)
m = op('maestra').op('maestra_ext').module
ext = m.get_ext(op('maestra'))

# Entity state
ext.Initialize('my-entity', 'http://192.168.1.10:8080')
ext.State                          # dict — current state
ext.Get('brightness', 0)           # safe access with default
ext['brightness']                  # dict-style access
ext.UpdateState({'brightness': 75})  # merge update
ext.SetState({'brightness': 0})    # full replace

# Streams
ext.ListStreams('ndi')
ext.AdvertiseStream('My NDI', 'ndi', 'ndi', '192.168.1.10', 5961)
ext.StreamHeartbeat(stream_id)
ext.WithdrawStream(stream_id)
ext.RequestStream(stream_id)
ext.StopSession(session_id)

# Discovery
ext.DiscoverAndInitialize('my-entity', timeout=5.0)
```

## OSC Integration

The COMP includes an OSC In DAT listening on port **57121** for real-time state change events from the Maestra OSC Gateway. State updates received via OSC are automatically merged and trigger the `onStateChange` callback.

## Network Topology

```
[OSC Gateway :57121] ─→ [osc_in DAT] ─→ [osc_script] ─→ [MaestraExt]
                                                              │
                         [state_table DAT] ←──────────────────┤
                         [state_chop CHOP] ←──────────────────┤
                         [callbacks DAT]   ←──────────────────┘
                              │
                    [Your Visual Network]
```

## License

MIT
