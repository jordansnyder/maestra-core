# Unreal Engine Plugin

## Installation

Copy `MaestraPlugin` to your project's `Plugins` directory.

## Blueprint Usage

1. Create a `MaestraClient` variable
2. Call `Initialize` with API URL
3. Call `GetEntityBySlug` to fetch entity
4. Use entity methods to read/update state

## C++ Usage

```cpp
#include "MaestraClient.h"
#include "MaestraEntity.h"

void AMyActor::BeginPlay()
{
    MaestraClient = NewObject<UMaestraClient>();
    MaestraClient->Initialize(TEXT("http://localhost:8080"));
    MaestraClient->OnEntityReceived.AddDynamic(this, &AMyActor::OnEntity);
    MaestraClient->GetEntityBySlug(TEXT("gallery-light-1"));
}

void AMyActor::OnEntity(const FString& Slug, UMaestraEntity* Entity)
{
    float Brightness = Entity->GetStateFloat(TEXT("brightness"), 0.0f);
}
```

See `sdks/unreal/MaestraPlugin/README.md` for full documentation.
