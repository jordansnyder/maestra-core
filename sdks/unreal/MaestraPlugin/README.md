# Maestra Unreal Engine Plugin

Connect Unreal Engine to the Maestra platform for real-time entity state management.

## Requirements

- Unreal Engine 5.0+
- C++17 compatible compiler

## Installation

1. Copy the `MaestraPlugin` folder to your project's `Plugins` directory
2. Enable the plugin in Edit → Plugins → Project → Maestra Plugin
3. Restart the editor

## Quick Start

### Blueprint Usage

1. Create a reference to `UMaestraClient`:
   - Add a variable of type `Maestra Client`
   - In BeginPlay, call `Construct Object from Class` → `MaestraClient`

2. Initialize and fetch entity:
```
BeginPlay:
  → Construct MaestraClient
  → Initialize (ApiUrl: "http://localhost:8080")
  → GetEntityBySlug (Slug: "my-light")

OnEntityReceived Event:
  → Store Entity reference
  → GetStateFloat (Key: "brightness")
```

3. Update state:
```
OnButtonPressed:
  → Entity.SetStateInt (Key: "brightness", Value: 100)
```

### C++ Usage

```cpp
#include "MaestraClient.h"
#include "MaestraEntity.h"

// In your Actor's BeginPlay
void AMyActor::BeginPlay()
{
    Super::BeginPlay();

    // Create and initialize client
    MaestraClient = NewObject<UMaestraClient>();
    MaestraClient->Initialize(TEXT("http://localhost:8080"));

    // Bind to entity received event
    MaestraClient->OnEntityReceived.AddDynamic(this, &AMyActor::OnEntityReceived);
    MaestraClient->OnError.AddDynamic(this, &AMyActor::OnError);

    // Fetch entity
    MaestraClient->GetEntityBySlug(TEXT("room-a-light-1"));
}

void AMyActor::OnEntityReceived(const FString& Slug, UMaestraEntity* Entity)
{
    // Store reference
    LightEntity = Entity;

    // Read state
    float Brightness = Entity->GetStateFloat(TEXT("brightness"), 0.0f);
    FString Color = Entity->GetStateString(TEXT("color"), TEXT("#ffffff"));

    // Apply to your game objects
    UpdateLightBrightness(Brightness / 100.0f);
}

void AMyActor::SetBrightness(float Value)
{
    if (LightEntity)
    {
        LightEntity->SetStateFloat(TEXT("brightness"), Value * 100.0f);
    }
}
```

## API Reference

### UMaestraClient

| Method | Description |
|--------|-------------|
| `Initialize(ApiUrl)` | Connect to Maestra Fleet Manager |
| `GetEntityBySlug(Slug)` | Fetch entity by slug |
| `GetEntities(EntityType)` | List entities (optional type filter) |
| `UpdateEntityState(Id, Json)` | Merge state update |
| `SetEntityState(Id, Json)` | Replace entire state |
| `GetCachedEntity(Slug)` | Get cached entity reference |

### UMaestraEntity

| Method | Description |
|--------|-------------|
| `GetStateString(Key, Default)` | Get string value |
| `GetStateInt(Key, Default)` | Get integer value |
| `GetStateFloat(Key, Default)` | Get float value |
| `GetStateBool(Key, Default)` | Get boolean value |
| `HasStateKey(Key)` | Check if key exists |
| `GetStateKeys()` | List all state keys |
| `GetStateAsJson()` | Get full state as JSON |
| `UpdateState(Json)` | Merge state update |
| `SetState(Json)` | Replace entire state |
| `SetStateValue(Key, Value)` | Set single string |
| `SetStateInt(Key, Value)` | Set single integer |
| `SetStateFloat(Key, Value)` | Set single float |
| `SetStateBool(Key, Value)` | Set single boolean |

### Events

**UMaestraClient:**
- `OnConnected(bool Success)` - Connection status
- `OnEntityReceived(FString Slug, UMaestraEntity* Entity)` - Entity fetched
- `OnEntitiesReceived(TArray<FMaestraEntityData> Entities)` - Entity list
- `OnError(FString Message)` - Error occurred

**UMaestraEntity:**
- `OnStateChanged(FMaestraStateChangeEvent Event)` - State updated

## Blueprint Nodes

All methods are exposed as Blueprint callable functions:

- **Initialize** - Set API URL
- **Get Entity By Slug** - Async entity fetch
- **Get Entities** - Async entity list
- **Update Entity State** - Merge state changes
- **Set Entity State** - Replace state

## Example: Light Controller

```cpp
UCLASS()
class AInteractiveLight : public AActor
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere)
    FString EntitySlug = TEXT("gallery-light-1");

    UPROPERTY(EditAnywhere)
    FString ApiUrl = TEXT("http://localhost:8080");

    UPROPERTY()
    UMaestraClient* Client;

    UPROPERTY()
    UMaestraEntity* Entity;

    UPROPERTY(VisibleAnywhere)
    UPointLightComponent* Light;

protected:
    virtual void BeginPlay() override
    {
        Super::BeginPlay();

        Client = NewObject<UMaestraClient>();
        Client->OnEntityReceived.AddDynamic(this, &AInteractiveLight::HandleEntity);
        Client->Initialize(ApiUrl);
        Client->GetEntityBySlug(EntitySlug);
    }

    UFUNCTION()
    void HandleEntity(const FString& Slug, UMaestraEntity* InEntity)
    {
        Entity = InEntity;
        ApplyState();
    }

    void ApplyState()
    {
        if (Entity && Light)
        {
            float Brightness = Entity->GetStateFloat(TEXT("brightness"), 100.0f);
            Light->SetIntensity(Brightness * 100.0f);

            bool bOn = Entity->GetStateBool(TEXT("on"), true);
            Light->SetVisibility(bOn);
        }
    }

public:
    UFUNCTION(BlueprintCallable)
    void SetBrightness(float Value)
    {
        if (Entity)
        {
            Entity->SetStateFloat(TEXT("brightness"), Value);
        }
    }

    UFUNCTION(BlueprintCallable)
    void Toggle()
    {
        if (Entity)
        {
            bool bCurrentlyOn = Entity->GetStateBool(TEXT("on"), true);
            Entity->SetStateBool(TEXT("on"), !bCurrentlyOn);
        }
    }
};
```

## License

MIT
