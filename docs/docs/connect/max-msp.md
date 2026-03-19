# Max/MSP

Get Max/MSP sending and receiving data through Maestra using OSC.

## What you need

- **Max/MSP** (version 8 or later)
- **The Maestra server address** — ask your technical director or admin. You'll need the IP address of the machine running Maestra (e.g., `192.168.1.10`).

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, the address is `localhost`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## How it works

Max/MSP talks to Maestra through **OSC** (Open Sound Control), a protocol Max already supports natively. You send OSC messages to Maestra's OSC Gateway, and it routes them to the right entity. Messages from other devices come back to Max the same way.

**Ports to know:**

| Direction | Port | What it does |
|-----------|------|--------------|
| Send to Maestra | 57120 | Your messages go here |
| Receive from Maestra | 57121 | Updates from other devices arrive here |

## Receive entity state

This patch listens for state changes on an entity called `gallery-light-1`:

```
[udpreceive 57121]
|
[oscparse]
|
[route /maestra/entity/state]
|
[route actuator]
|
[route gallery-light-1]
|
[dict.unpack brightness: color:]
|         |
[number]  [swatch]
```

When any device updates `gallery-light-1`, the new brightness and color values appear in your patch instantly.

## Send state updates

This patch sends a brightness value to the same entity:

```
[number]  <- drag to set brightness
|
[dict brightness $1]
|
[prepend /maestra/entity/state/update/gallery-light-1]
|
[oscformat]
|
[udpsend 192.168.1.10 57120]
```

Replace `192.168.1.10` with your Maestra server's IP address (or `localhost` if running locally).

## Sending multiple values at once

```
[number]        [swatch]
|               |
[dict brightness $1 color $1]
|
[prepend /maestra/entity/state/update/gallery-light-1]
|
[oscformat]
|
[udpsend 192.168.1.10 57120]
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Events & Messages](../concepts/events.md) — learn about the message system behind OSC routing
- [Max/MSP SDK Reference](../sdks/max-msp.md) — additional examples
- [OSC Gateway API](../api/osc.md) — full OSC address reference
