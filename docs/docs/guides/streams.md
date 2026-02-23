# Streams Guide

Maestra Streams enable devices to advertise high-bandwidth data streams and other devices to discover and connect to them. The **control plane** (discovery, negotiation, session management) runs through Maestra, while the **data plane** (actual bytes) flows directly peer-to-peer between devices.

## Concepts

### Stream Types

Maestra includes 11 built-in stream types for creative workflows:

| Type | Use Case | Default Config |
|------|----------|---------------|
| `ndi` | NDI video between machines | codec, resolution, fps |
| `audio` | Audio feeds | sample_rate, channels, format |
| `video` | Generic video (non-NDI) | codec, resolution, fps |
| `texture` | GPU textures / framebuffers | format, width, height |
| `sensor` | Sensor telemetry | rate_hz, format |
| `osc` | High-frequency OSC data | rate_hz |
| `midi` | MIDI streams | - |
| `data` | Generic data | format |
| `srt` | SRT video | latency_ms |
| `spout` | Spout texture sharing (Windows) | format |
| `syphon` | Syphon texture sharing (macOS) | format |

Custom types can be created via `POST /streams/types`.

### Protocols

The protocol field describes how the data plane will transport bytes:

- `tcp` / `udp` - Raw socket transport
- `ndi` - NewTek NDI protocol
- `srt` - Secure Reliable Transport
- `webrtc` - WebRTC peer connection
- `spout` / `syphon` - GPU texture sharing
- `shared_memory` - Local shared memory

### Control Plane vs Data Plane

Maestra only handles the **control plane**: who is publishing what, who wants to consume it, and brokering the initial handshake. The actual data never flows through Maestra's message bus -- it goes directly between devices using whatever protocol they agree on.

## Stream Lifecycle

```
1. ADVERTISE    Publisher registers stream with Maestra
2. DISCOVER     Consumers browse available streams
3. REQUEST      Consumer requests access to a stream
4. NEGOTIATE    NATS request-reply handshake with publisher
5. SESSION      Active streaming session (data flows P2P)
6. HEARTBEAT    Both sides refresh TTLs every ~10 seconds
7. WITHDRAW     Publisher removes stream when done
```

### Heartbeats & TTL

Streams and sessions have a **30-second TTL** in Redis. If a publisher or consumer crashes without withdrawing, its entries automatically expire. Publishers should send heartbeats every **10 seconds** to keep their streams alive.

## NATS Subjects

| Subject | Purpose |
|---------|---------|
| `maestra.stream.advertise` | Broadcast when a stream is advertised |
| `maestra.stream.advertise.{type}` | Type-specific advertisement |
| `maestra.stream.withdraw.{id}` | Stream withdrawn |
| `maestra.stream.request.{id}` | Request-reply: consumer to publisher |
| `maestra.stream.heartbeat.>` | Stream heartbeat |
| `maestra.stream.session.started` | Session created |
| `maestra.stream.session.stopped` | Session ended |
| `maestra.stream.session.heartbeat.>` | Session heartbeat |

## SDK Examples

### Python: Publish and Consume a Stream

**Publisher** (using `StreamPublisher` with automatic heartbeat):

```python
import asyncio
from maestra import MaestraClient, StreamPublisher, StreamAdvertiseParams

async def main():
    client = MaestraClient()
    await client.connect()

    publisher = StreamPublisher(client, StreamAdvertiseParams(
        name="Stage Camera A",
        stream_type="ndi",
        publisher_id="td-workstation-01",
        protocol="ndi",
        address="192.168.1.50",
        port=5960,
        config={"resolution": "1920x1080", "fps": 30},
    ))

    stream = await publisher.start()
    print(f"Advertised: {stream.name} ({stream.id})")

    # Stream stays alive via automatic heartbeat...
    await asyncio.sleep(300)

    await publisher.stop()
    await client.disconnect()

asyncio.run(main())
```

**Consumer** (using `StreamConsumer` with automatic session heartbeat):

```python
import asyncio
from maestra import MaestraClient, StreamConsumer, StreamRequestParams

async def main():
    client = MaestraClient()
    await client.connect()

    # Discover NDI streams
    streams = await client.get_streams(stream_type="ndi")
    print(f"Found {len(streams)} NDI streams")

    if streams:
        consumer = StreamConsumer(client, streams[0].id, StreamRequestParams(
            consumer_id="max-workstation-02",
            consumer_address="192.168.1.60",
        ))

        offer = await consumer.connect()
        print(f"Connect to {offer.publisher_address}:{offer.publisher_port}")

        # Session stays alive via automatic heartbeat...
        await asyncio.sleep(300)

        await consumer.disconnect()

    await client.disconnect()

asyncio.run(main())
```

### JavaScript: Browser Stream Discovery

```typescript
import { MaestraClient } from '@maestra/sdk'

const client = new MaestraClient({ apiUrl: 'http://localhost:8080' })

// List all active streams
const streams = await client.getStreams()
console.log(`${streams.length} active streams`)

// Filter by type
const audioStreams = await client.getStreams('audio')

// Advertise a stream
const stream = await client.advertiseStream({
  name: 'Browser Audio',
  stream_type: 'audio',
  publisher_id: 'web-client-01',
  protocol: 'webrtc',
  address: '192.168.1.70',
  port: 0,
  config: { sampleRate: 48000, channels: 2 },
})

// Start heartbeat
const heartbeat = setInterval(() => {
  client.streamHeartbeat(stream.id)
}, 10000)

// Request to consume a stream
const offer = await client.requestStream(streams[0].id, {
  consumer_id: 'web-client-01',
  consumer_address: '192.168.1.70',
})
console.log(`Connect to ${offer.publisher_address}:${offer.publisher_port}`)
```

### TouchDesigner: Syphon/Spout Stream

```python
maestra = op('maestra').ext.MaestraExt

# Advertise a Syphon texture output
stream = maestra.AdvertiseStream(
    name='Stage Visuals',
    stream_type='syphon',
    protocol='syphon',
    address='127.0.0.1',
    port=0,
    config={'format': 'rgba8', 'width': 1920, 'height': 1080},
)

# Use a Timer CHOP to call heartbeat every 10s
# In the Timer callback:
maestra.StreamHeartbeat(stream['id'])

# Discover available streams
streams = maestra.ListStreams(stream_type='ndi')
for s in streams:
    print(f"{s['name']} at {s['address']}:{s['port']}")
```

### Arduino: Sensor Stream via MQTT

```cpp
#include <WiFi.h>
#include <MaestraClient.h>

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);

unsigned long lastHeartbeat = 0;
const char* streamId = nullptr;

void setup() {
    WiFi.begin("ssid", "password");
    while (WiFi.status() != WL_CONNECTED) delay(500);

    maestra.setBroker("192.168.1.100", 1883);
    maestra.connect();

    // Advertise a sensor data stream
    maestra.advertiseStream(
        "Temperature Array",      // name
        "sensor",                 // stream_type
        "udp",                    // protocol
        WiFi.localIP().toString().c_str(),
        8888                      // port
    );

    // Subscribe to discover other streams
    maestra.subscribeStreamEvents([](const char* id, const char* name,
                                     const char* type, const char* addr, int port) {
        Serial.printf("Stream: %s (%s) at %s:%d\n", name, type, addr, port);
    });
}

void loop() {
    maestra.loop();

    // Send heartbeat every 10 seconds
    if (millis() - lastHeartbeat > 10000) {
        // Note: streamId would need to be captured from the advertise response
        lastHeartbeat = millis();
    }
}
```

### Unity: Stream Discovery

```csharp
using Maestra;

public class StreamViewer : MonoBehaviour
{
    MaestraClient client;

    void Start()
    {
        client = gameObject.AddComponent<MaestraClient>();
        client.apiUrl = "http://localhost:8080";
        client.Initialize();

        // Discover NDI streams
        client.GetStreams("ndi", OnStreamsReceived);
    }

    void OnStreamsReceived(List<StreamInfo> streams)
    {
        foreach (var stream in streams)
        {
            Debug.Log($"Stream: {stream.Name} at {stream.Address}:{stream.Port}");
        }

        // Request to consume the first stream
        if (streams.Count > 0)
        {
            var request = new StreamRequestBody
            {
                ConsumerId = "unity-client",
                ConsumerAddress = "192.168.1.80"
            };
            client.RequestStream(streams[0].Id, request, OnOffer);
        }
    }

    void OnOffer(StreamOffer offer)
    {
        Debug.Log($"Connect to {offer.PublisherAddress}:{offer.PublisherPort}");
        // Use offer details to establish NDI/Spout/etc connection
    }
}
```

### Unreal Engine: NDI Stream Advertisement

```cpp
// In your Actor header:
UPROPERTY() UMaestraClient* MaestraClient;
FTimerHandle HeartbeatHandle;
FString MyStreamId;

UFUNCTION() void OnStreamAdvertised(const FMaestraStreamInfo& Stream);
UFUNCTION() void OnStreamsReceived(const TArray<FMaestraStreamInfo>& Streams);

// In BeginPlay():
MaestraClient = NewObject<UMaestraClient>(this);
MaestraClient->Initialize(TEXT("http://localhost:8080"));
MaestraClient->OnStreamAdvertised.AddDynamic(this, &AMyActor::OnStreamAdvertised);
MaestraClient->OnStreamsReceived.AddDynamic(this, &AMyActor::OnStreamsReceived);

// Advertise an NDI output
FMaestraStreamAdvertiseRequest Adv;
Adv.Name = TEXT("Unreal Render Output");
Adv.StreamType = TEXT("ndi");
Adv.PublisherId = TEXT("unreal-workstation-01");
Adv.Protocol = TEXT("ndi");
Adv.Address = TEXT("192.168.1.90");
Adv.Port = 5960;
Adv.ConfigJson = TEXT("{\"resolution\":\"1920x1080\",\"fps\":60}");
MaestraClient->AdvertiseStream(Adv);

// Discover other streams
MaestraClient->GetStreams(TEXT("ndi"));

// Callback: start heartbeat timer after successful advertisement
void AMyActor::OnStreamAdvertised(const FMaestraStreamInfo& Stream)
{
    MyStreamId = Stream.Id;
    GetWorldTimerManager().SetTimer(HeartbeatHandle, [this]()
    {
        MaestraClient->StreamHeartbeat(MyStreamId);
    }, 10.0f, true);
}

void AMyActor::OnStreamsReceived(const TArray<FMaestraStreamInfo>& Streams)
{
    for (const auto& S : Streams)
    {
        UE_LOG(LogTemp, Log, TEXT("Stream: %s at %s:%d"), *S.Name, *S.Address, S.Port);
    }
}
```

## Troubleshooting

**Stream disappears after 30 seconds:**
The publisher is not sending heartbeats. Ensure your heartbeat loop runs every ~10 seconds. Use `StreamPublisher` in Python for automatic heartbeat.

**504 Gateway Timeout on stream request:**
The publisher is not subscribed to NATS `maestra.stream.request.{stream_id}`. The publisher device must be listening for incoming requests to respond with connection details.

**Stream manager not connected (503):**
Redis or NATS is not available. Check `make logs-service SERVICE=fleet-manager` and verify Redis is running.

**Empty stream list despite active publishers:**
Check that the publisher's stream type is valid. Verify with `curl http://localhost:8080/streams/types` and ensure you're not filtering by an incorrect type.

## Related Documentation

- [Streams API Reference](../api/streams.md) - All 13 endpoints with curl examples
- [MQTT Integration](mqtt.md) - For Arduino/ESP32 stream integration
- [Monitoring](monitoring.md) - Session history in Grafana dashboards
