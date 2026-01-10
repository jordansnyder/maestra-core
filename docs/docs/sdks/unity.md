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

See `sdks/unity/README.md` for full documentation.
