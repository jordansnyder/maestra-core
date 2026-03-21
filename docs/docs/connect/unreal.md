# Unreal Engine

Connect your Unreal Engine 5 project to Maestra to read and control entity state from Blueprints or C++.

## What you need

- **Unreal Engine 5.x** (via Epic Games Launcher)
- **Visual Studio 2022** with the "Game development with C++" and "Desktop development with C++" workloads
- **The Maestra server address** — ask your technical director or admin (e.g., `http://192.168.1.10:8080`)

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, the address is `http://localhost:8080`. See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Add the plugin to your project

1. In your UE5 project folder (where the `.uproject` file lives), create a `Plugins` folder if it doesn't exist
2. Copy the `MaestraPlugin` folder from `sdks/unreal/` into `Plugins/`

Your project should look like:

```
YourProject/
├── YourProject.uproject
├── Plugins/
│   └── MaestraPlugin/
│       ├── MaestraPlugin.uplugin
│       └── Source/
```

## Step 2: Set up C++ (if needed)

If your project is Blueprint-only, you need to add a C++ module first. In Unreal Editor, go to **Tools > New C++ Class**, pick **Actor**, and name it anything. This generates the project files Unreal needs.

Then add `"MaestraPlugin"` to your `Build.cs` dependencies:

```csharp
PublicDependencyModuleNames.AddRange(new string[] {
    "Core", "CoreUObject", "Engine",
    "MaestraPlugin"  // Add this
});
```

## Step 3: Build and connect

1. Generate Visual Studio project files (right-click your `.uproject` > **Generate Visual Studio project files**)
2. Open the `.sln` in Visual Studio and build your project

### Blueprint usage

```
BeginPlay
  -> Construct MaestraClient
  -> Initialize (ApiUrl: "http://192.168.1.10:8080")
  -> GetEntityBySlug (Slug: "gallery-light-1")

OnEntityReceived
  -> GetStateFloat (Key: "brightness")
  -> Set Light Intensity
```

### C++ usage

```cpp
#include "MaestraClient.h"
#include "MaestraEntity.h"

void AMyActor::BeginPlay()
{
    Super::BeginPlay();

    MaestraClient = NewObject<UMaestraClient>(this);
    MaestraClient->Initialize(TEXT("http://192.168.1.10:8080"));
    MaestraClient->OnEntityReceived.AddDynamic(this, &AMyActor::OnEntityReceived);
    MaestraClient->GetEntityBySlug(TEXT("gallery-light-1"));
}

void AMyActor::OnEntityReceived(const FString& Slug, UMaestraEntity* Entity)
{
    float Brightness = Entity->GetStateFloat(TEXT("brightness"), 0.0f);
    // Use Brightness to drive your scene
}
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Streams](../concepts/streams.md) — share video feeds between devices (NDI, Spout, etc.)
- [Unreal Engine SDK Reference](../sdks/unreal.md) — full setup details, C++ patterns, streams, and troubleshooting
