# Maestra Max/MSP Integration

Connect Max/MSP to the Maestra platform using OSC for real-time state synchronization.

## Overview

The Maestra Max/MSP integration uses OSC to communicate with the Maestra OSC Gateway.
State changes are received as OSC messages and can be sent back to update entity state.

## Quick Start

### Receiving State Changes

```
[udpreceive 57121]
|
[oscparse]
|
[route /maestra/entity/state]
|
[route room actuator]  ; Filter by entity type
|
[route my-entity-slug]
|
[dict.unpack current_state:]
|
[dict.unpack brightness: color:]
```

### Sending State Updates

```
[dict brightness 75 color "#ff0000"]
|
[prepend /maestra/entity/state/update/my-entity-slug]
|
[oscformat]
|
[udpsend localhost 57120]
```

## Abstractions

### maestra.entity

Main abstraction for entity state management.

**Arguments:**
- `@slug` - Entity slug
- `@host` - OSC gateway host (default: localhost)
- `@port` - OSC gateway port (default: 57120)

**Inlets:**
1. State updates (dict)
2. Messages (get, set, subscribe)

**Outlets:**
1. Current state (dict)
2. Changed keys (list)
3. Raw state values

**Example:**
```
[maestra.entity @slug my-light @host localhost @port 57120]
|   |   |
[   |   [route brightness color]
    |
[changed keys]
```

### maestra.state

Simple state value accessor.

```
[maestra.state my-light brightness]
|
[* 2.55]  ; Scale 0-100 to 0-255
|
[outlet]
```

## Example Patch

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ [udpreceive 57121]                      │   │
│  │         │                                │   │
│  │ [oscparse]                              │   │
│  │         │                                │   │
│  │ [route /maestra/entity/state]           │   │
│  │         │                                │   │
│  │ [js parse-state.js]                     │   │
│  │         │                                │   │
│  │ [dict current_state]                    │   │
│  │    │       │                            │   │
│  │ [dict.unpack] [s state-changed]         │   │
│  │    │                                    │   │
│  │ [brightness] [color]                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ SEND STATE                              │   │
│  │                                         │   │
│  │ [slider 0 100]                         │   │
│  │         │                               │   │
│  │ [prepend brightness]                   │   │
│  │         │                               │   │
│  │ [dict]                                 │   │
│  │         │                               │   │
│  │ [prepend /entity/state/update/my-light] │   │
│  │         │                               │   │
│  │ [oscformat]                            │   │
│  │         │                               │   │
│  │ [udpsend localhost 57120]              │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

## JavaScript Helper (parse-state.js)

```javascript
// parse-state.js - Helper for parsing Maestra state events

function anything() {
    var args = arrayfromargs(arguments);
    var address = args[0];
    var payload = args.slice(1).join('');

    try {
        var data = JSON.parse(payload);

        if (data.type === 'state_changed') {
            // Output entity slug
            outlet(0, data.entity_slug);

            // Output current state as dict
            outlet(1, 'dictionary', JSON.stringify(data.current_state));

            // Output changed keys
            outlet(2, data.changed_keys);
        }
    } catch (e) {
        post("Error parsing state: " + e + "\n");
    }
}
```

## OSC Message Format

### Incoming (State Changes)

```
/maestra/entity/state/<type>/<slug> <json-payload>

Example:
/maestra/entity/state/actuator/room-a-light-1 {"type":"state_changed","entity_slug":"room-a-light-1","current_state":{"brightness":75},"changed_keys":["brightness"]}
```

### Outgoing (State Updates)

```
/maestra/entity/state/update/<slug> <json-payload>
/maestra/entity/state/set/<slug> <json-payload>

Example:
/maestra/entity/state/update/room-a-light-1 {"state":{"brightness":100},"source":"maxmsp"}
```

## License

MIT
