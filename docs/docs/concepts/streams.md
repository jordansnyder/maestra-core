# Streams

## What is a stream?

A **stream** is a live feed of data between two devices — a video output from TouchDesigner, an audio feed, an NDI source, a Syphon texture, or raw sensor data. Streams are for high-bandwidth, continuous data that doesn't fit neatly into entity state (which is better for discrete values like "brightness: 75").

Think of it like this:

- **Entity state** = a shared whiteboard that everyone can read and write to
- **Streams** = a live video/audio cable connecting two devices directly

## How streams work

Maestra handles the *discovery and connection* — helping devices find each other and agree on how to talk. The actual data flows **directly between devices**, not through Maestra, so there's no bottleneck.

The lifecycle looks like this:

1. **Advertise** — A device tells Maestra "I have a stream available" (e.g., "1080p NDI video feed from Camera A")
2. **Discover** — Other devices browse what's available and find streams they want
3. **Request** — A device asks to connect to a specific stream
4. **Connect** — Maestra brokers a quick handshake, then the two devices talk directly
5. **Heartbeat** — Both sides check in every ~10 seconds to confirm they're still there
6. **Withdraw** — The source removes the stream when it's done

If a device goes offline unexpectedly, its streams automatically disappear after 30 seconds.

## Stream types

Maestra supports these stream types out of the box:

| Type | What it's for |
|------|--------------|
| `ndi` | NDI video/audio (NewTek) |
| `syphon` | Syphon texture sharing (macOS) |
| `spout` | Spout texture sharing (Windows) |
| `srt` | SRT video streaming |
| `video` | Generic video |
| `audio` | Audio feeds |
| `texture` | GPU textures |
| `midi` | MIDI data |
| `osc` | OSC message streams |
| `sensor` | Sensor data |
| `data` | Generic data |

## Example: sharing a TouchDesigner output

In TouchDesigner, advertise a Syphon texture:

```python
stream = ext.AdvertiseStream(
    name='Stage Visuals',
    stream_type='syphon',
    protocol='syphon',
    address='127.0.0.1',
    port=0,
)
```

In Unity, discover and connect to it:

```csharp
client.GetStreams("syphon", (streams) => {
    foreach (var s in streams)
        Debug.Log($"Found: {s.Name} at {s.Address}");
});
```

Every SDK supports streams — see your tool's [Connect page](../connect/touchdesigner.md) for specific examples.

??? info "Technical details"
    - Stream metadata is stored in **Redis** with a 30-second TTL (time-to-live)
    - Discovery and negotiation use **NATS request-reply** with a 5-second timeout
    - Session history is persisted in a **PostgreSQL hypertable** for audit/analytics
    - NATS subjects follow the pattern `maestra.stream.advertise`, `maestra.stream.request.{id}`, etc.
    - Full API documentation: [Streams API Reference](../api/streams.md)

## Next steps

- [Entities & State](entities.md) — for sharing discrete values instead of continuous feeds
- [Routing](routing.md) — automatically patch signals between entities
- [Streams API Reference](../api/streams.md) — full REST API documentation
- [Streams Guide](../guides/streams.md) — detailed walkthroughs for every SDK
