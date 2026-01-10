# Maestra Unity SDK

Connect Unity to the Maestra platform for real-time entity state management.

## Requirements

- Unity 2021.3+
- Newtonsoft.Json (included via package dependency)

## Installation

### Unity Package Manager (Git URL)

1. Open Window → Package Manager
2. Click + → Add package from git URL
3. Enter: `https://github.com/maestra/maestra-core.git?path=sdks/unity`

### Manual Installation

1. Copy the `unity` folder to your project's `Packages` directory
2. Rename to `dev.maestra.sdk`

## Quick Start

### Setup

1. Create an empty GameObject in your scene
2. Add the `MaestraClient` component
3. Set the API URL (default: `http://localhost:8080`)

### Basic Usage

```csharp
using UnityEngine;
using Maestra;

public class LightController : MonoBehaviour
{
    private MaestraClient _client;
    private MaestraEntity _lightEntity;

    void Start()
    {
        // Get or create client
        _client = FindObjectOfType<MaestraClient>();
        if (_client == null)
        {
            var clientObj = new GameObject("MaestraClient");
            _client = clientObj.AddComponent<MaestraClient>();
            _client.apiUrl = "http://localhost:8080";
        }

        _client.Initialize();

        // Subscribe to events
        _client.OnEntityReceived += HandleEntityReceived;
        _client.OnError += HandleError;

        // Fetch entity
        _client.GetEntityBySlug("gallery-light-1");
    }

    void HandleEntityReceived(MaestraEntity entity)
    {
        if (entity.Slug == "gallery-light-1")
        {
            _lightEntity = entity;
            _lightEntity.OnStateChanged += HandleStateChanged;

            // Read initial state
            float brightness = entity.GetFloat("brightness", 100f);
            Color color = entity.GetColor("color", Color.white);

            ApplyToLight(brightness, color);
        }
    }

    void HandleStateChanged(MaestraEntity entity, List<string> changedKeys)
    {
        if (changedKeys.Contains("brightness") || changedKeys.Contains("color"))
        {
            float brightness = entity.GetFloat("brightness", 100f);
            Color color = entity.GetColor("color", Color.white);
            ApplyToLight(brightness, color);
        }
    }

    void HandleError(string error)
    {
        Debug.LogError($"Maestra error: {error}");
    }

    void ApplyToLight(float brightness, Color color)
    {
        // Apply to your light component
        var light = GetComponent<Light>();
        if (light != null)
        {
            light.intensity = brightness / 100f;
            light.color = color;
        }
    }

    public void SetBrightness(float value)
    {
        _lightEntity?.SetValue("brightness", value);
    }

    public void SetColor(Color color)
    {
        _lightEntity?.SetValue("color", color);
    }
}
```

## API Reference

### MaestraClient

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `apiUrl` | string | Base URL for Fleet Manager API |
| `IsInitialized` | bool | Whether client has been initialized |

#### Methods

| Method | Description |
|--------|-------------|
| `Initialize()` | Initialize the client |
| `GetEntityBySlug(slug, callback)` | Fetch entity by slug |
| `GetEntities(type, callback)` | List entities (optional type filter) |
| `GetCachedEntity(slug)` | Get cached entity reference |
| `UpdateEntityState(id, state, callback)` | Merge state update |
| `SetEntityState(id, state, callback)` | Replace entire state |

#### Events

| Event | Description |
|-------|-------------|
| `OnConnected` | Client initialized |
| `OnError(string)` | Error occurred |
| `OnEntityReceived(MaestraEntity)` | Entity fetched |
| `OnEntitiesReceived(List<EntityData>)` | Entity list fetched |

### MaestraEntity

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `Id` | string | Entity UUID |
| `Name` | string | Display name |
| `Slug` | string | Unique slug |
| `EntityType` | string | Type name |
| `ParentId` | string | Parent entity ID |
| `Status` | string | Entity status |

#### State Getters

| Method | Description |
|--------|-------------|
| `GetString(key, default)` | Get string value |
| `GetInt(key, default)` | Get int value |
| `GetFloat(key, default)` | Get float value |
| `GetBool(key, default)` | Get bool value |
| `GetVector3(key, default)` | Get Vector3 from {x, y, z} |
| `GetColor(key, default)` | Get Color from hex string |
| `HasKey(key)` | Check if key exists |
| `GetKeys()` | Get all state keys |
| `GetState()` | Get full state dictionary |

#### State Setters

| Method | Description |
|--------|-------------|
| `UpdateState(dict, callback)` | Merge state update |
| `SetState(dict, callback)` | Replace entire state |
| `SetValue(key, string, callback)` | Set string value |
| `SetValue(key, int, callback)` | Set int value |
| `SetValue(key, float, callback)` | Set float value |
| `SetValue(key, bool, callback)` | Set bool value |
| `SetValue(key, Vector3, callback)` | Set Vector3 value |
| `SetValue(key, Color, callback)` | Set Color value |

#### Events

| Event | Description |
|-------|-------------|
| `OnStateChanged(entity, changedKeys)` | State updated |

## Examples

### Interactive Object

```csharp
public class InteractiveObject : MonoBehaviour
{
    public string entitySlug = "interactive-1";
    public MaestraClient client;

    private MaestraEntity _entity;

    void Start()
    {
        client.OnEntityReceived += OnEntity;
        client.GetEntityBySlug(entitySlug);
    }

    void OnEntity(MaestraEntity entity)
    {
        if (entity.Slug == entitySlug)
        {
            _entity = entity;
            _entity.OnStateChanged += OnStateChanged;
            ApplyState();
        }
    }

    void OnStateChanged(MaestraEntity entity, List<string> keys)
    {
        ApplyState();
    }

    void ApplyState()
    {
        // Position
        if (_entity.HasKey("position"))
        {
            transform.position = _entity.GetVector3("position");
        }

        // Rotation
        if (_entity.HasKey("rotation"))
        {
            Vector3 euler = _entity.GetVector3("rotation");
            transform.rotation = Quaternion.Euler(euler);
        }

        // Scale
        float scale = _entity.GetFloat("scale", 1f);
        transform.localScale = Vector3.one * scale;

        // Color
        var renderer = GetComponent<Renderer>();
        if (renderer != null)
        {
            renderer.material.color = _entity.GetColor("color", Color.white);
        }
    }

    void OnMouseDown()
    {
        // Toggle active state
        bool active = _entity.GetBool("active", false);
        _entity.SetValue("active", !active);
    }
}
```

### Listing All Entities

```csharp
public class EntityBrowser : MonoBehaviour
{
    public MaestraClient client;

    void Start()
    {
        client.OnEntitiesReceived += OnEntities;
        client.GetEntities(); // Get all
        // Or filter by type:
        // client.GetEntities("device");
    }

    void OnEntities(List<EntityData> entities)
    {
        foreach (var entity in entities)
        {
            Debug.Log($"{entity.Name} ({entity.EntityType}): {entity.Slug}");
        }
    }
}
```

## License

MIT
