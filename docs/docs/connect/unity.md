# Unity

Connect your Unity project to Maestra to read and write entity state from any MonoBehaviour.

## What you need

- **Unity** (2021.3 LTS or later)
- **The Maestra server address** — ask your technical director or admin (e.g., `http://192.168.1.10:8080`)

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, the address is `http://localhost:8080`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Install the package

In Unity, go to **Window > Package Manager**, click the **+** button, choose **Add package from git URL**, and paste:

```
https://github.com/maestra/maestra-core.git?path=sdks/unity
```

## Step 2: Connect to an entity

Create a new C# script on any GameObject:

```csharp
using Maestra;

public class LightController : MonoBehaviour
{
    MaestraClient client;
    MaestraEntity entity;

    void Start()
    {
        client = gameObject.AddComponent<MaestraClient>();
        client.apiUrl = "http://192.168.1.10:8080";  // Your Maestra address
        client.Initialize();

        client.OnEntityReceived += OnEntity;
        client.GetEntityBySlug("gallery-light-1");
    }

    void OnEntity(MaestraEntity e)
    {
        entity = e;

        // Read values from the entity
        float brightness = entity.GetFloat("brightness", 0f);
        Color color = entity.GetColor("color", Color.white);
    }

    // Call this from a UI slider, animation, or any game logic
    public void SetBrightness(float value)
    {
        entity?.SetValue("brightness", value);
    }
}
```

Replace the `apiUrl` with your actual Maestra server address.

## Step 3: Use it

Press **Play**. The script connects to Maestra, fetches the entity, and gives you its current state. Any changes from other devices appear automatically through the `OnEntityReceived` callback.

To send values back, call `SetValue` from your game logic — UI buttons, physics triggers, timers, whatever makes sense for your project.

## Sharing streams

You can advertise and discover video, audio, or data streams:

```csharp
// Discover streams on the network
client.GetStreams("ndi", (streams) => {
    foreach (var s in streams)
        Debug.Log($"Found: {s.Name} at {s.Address}:{s.Port}");
});

// Share a stream from Unity
client.AdvertiseStream(new StreamAdvertiseRequest {
    Name = "Unity Camera",
    StreamType = "video",
    PublisherId = "unity-01",
    Protocol = "tcp",
    Address = "192.168.1.80",
    Port = 9000
}, (stream) => Debug.Log($"Advertised: {stream.Id}"));
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — share video, audio, and data between devices
- [Unity SDK Reference](../sdks/unity.md) — full API details
