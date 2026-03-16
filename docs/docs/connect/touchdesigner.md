# TouchDesigner

Get your TouchDesigner project talking to Maestra in a few minutes.

## What you need

- **TouchDesigner** (2022 or later)
- **The Maestra server address** — ask your technical director or admin. It looks something like `http://192.168.1.10:8080`.

!!! note "Running Maestra on your own machine?"
    If you set up Maestra yourself, your server address is `http://localhost:8080`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Add the Maestra component

1. In TouchDesigner, create a **Text DAT**
2. Set its file path to `sdks/touchdesigner/build_maestra_tox.py` (from the Maestra repository), or paste its contents into the DAT
3. Right-click the DAT and choose **Run Script**
4. A `maestra` COMP appears at `/project1/maestra`

## Step 2: Connect to your entity

1. Open the `maestra` COMP's custom parameters
2. Set **Server URL** to your Maestra server address (e.g., `http://192.168.1.10:8080`)
3. Set **Entity Slug** to the entity you want to control (e.g., `gallery-light-1`)
4. Click **Connect**

That's it. The entity's current state appears in the `state_table` and `state_chop` operators inside the COMP.

## Step 3: Send values to Maestra

Wire any CHOP into the `state_in` operator inside the COMP. Channel names become state keys, and values sync automatically.

```
[Slider CHOP "brightness"]  --+
[LFO CHOP "speed"]          --+-->>  state_in  -->>  Maestra
[Audio CHOP "level"]         --+
```

You can adjust the update rate and toggle auto-send in the COMP's parameters:

| Parameter | What it does |
|-----------|--------------|
| Max Updates/sec | Limits how often values are sent (default: 10) |
| Auto-Send on Change | Sends values whenever they change |
| Send State Now | Push current values immediately |

## Step 4: Receive live updates

The COMP automatically listens for changes from other devices. When someone else updates the entity (from a phone, another computer, or a sensor), the new values appear instantly in `state_table` and `state_chop`.

Use the CHOP outputs to drive anything in your patch — parameters, textures, audio levels, whatever you need.

## Using Python scripts instead

If you prefer scripting over the no-code approach:

```python
# Access the extension
m = op('/project1/maestra').op('maestra_ext').module
ext = m.get_ext(op('/project1/maestra'))

# Connect to your entity
ext.Initialize('gallery-light-1', 'http://192.168.1.10:8080')

# Read a value
brightness = ext.Get('brightness', 0)

# Send an update
ext.UpdateState({'brightness': 75, 'color': '#ff0000'})
```

## Sharing video and texture streams

You can advertise a Syphon or Spout texture output so other devices on the network can discover and use it:

```python
stream = ext.AdvertiseStream(
    name='Stage Visuals',
    stream_type='syphon',
    protocol='syphon',
    address='127.0.0.1',
    port=0,
)
```

Other devices running Maestra will automatically discover your stream. See the [Streams concept guide](../concepts/streams.md) for more on how this works.

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — share video, audio, and data between devices
- [TouchDesigner SDK Reference](../sdks/touchdesigner.md) — full API details
