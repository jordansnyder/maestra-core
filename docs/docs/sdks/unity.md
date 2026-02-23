# Unity SDK

## Installation

Add via Package Manager with git URL:
```
https://github.com/maestra/maestra-core.git?path=sdks/unity
```

## Quick Start

```csharp
using Maestra;

public class LightController : MonoBehaviour
{
    MaestraClient client;
    MaestraEntity entity;

    void Start()
    {
        client = gameObject.AddComponent<MaestraClient>();
        client.apiUrl = "http://localhost:8080";
        client.Initialize();

        client.OnEntityReceived += OnEntity;
        client.GetEntityBySlug("gallery-light-1");
    }

    void OnEntity(MaestraEntity e)
    {
        entity = e;
        float brightness = entity.GetFloat("brightness", 0f);
    }

    public void SetBrightness(float value)
    {
        entity?.SetValue("brightness", value);
    }
}
```

## Streams

```csharp
// Discover streams
client.GetStreams("ndi", (streams) => {
    foreach (var s in streams)
        Debug.Log($"Stream: {s.Name} at {s.Address}:{s.Port}");
});

// Advertise a stream
client.AdvertiseStream(new StreamAdvertiseRequest {
    Name = "Unity Camera",
    StreamType = "video",
    PublisherId = "unity-01",
    Protocol = "tcp",
    Address = "192.168.1.80",
    Port = 9000
}, (stream) => Debug.Log($"Advertised: {stream.Id}"));
```

See [Streams Guide](../guides/streams.md) for negotiation and session management.

See `sdks/unity/README.md` for full documentation.
