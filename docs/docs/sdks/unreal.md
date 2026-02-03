# MaestraPlugin for Unreal Engine 5 - Getting Started Guide

This guide walks you through adding the MaestraPlugin to your Unreal Engine 5 project and getting it running.

## Prerequisites

- Unreal Engine 5.x installed via Epic Games Launcher
- Visual Studio 2022 or later with the following workloads:
  - **Game development with C++**
  - **Desktop development with C++**
  - In Individual Components, ensure these are selected:
    - Windows 10/11 SDK
    - MSVC v143 (or latest) build tools

## Step 1: Add the Plugin to Your Project

1. Locate your UE5 project folder (contains your `.uproject` file)
2. Create a `Plugins` folder if it doesn't exist
3. Copy the `MaestraPlugin` folder into `Plugins`:

```
YourProject/
├── YourProject.uproject
├── Content/
├── Plugins/
│   └── MaestraPlugin/
│       ├── MaestraPlugin.uplugin
│       └── Source/
│           └── MaestraPlugin/
│               ├── MaestraPlugin.Build.cs
│               ├── Public/
│               │   ├── MaestraClient.h
│               │   └── MaestraEntity.h
│               └── Private/
│                   ├── MaestraPlugin.cpp
│                   ├── MaestraClient.cpp
│                   └── MaestraEntity.cpp
```

## Step 2: Set Up Your Project for C++

If your project is Blueprint-only (no existing C++ code), you need to add a C++ game module before Unreal will generate Visual Studio project files.

### Option A: Create C++ Class from Editor (if Editor opens)

1. Open your project in Unreal Editor
2. Go to **Tools → New C++ Class**
3. Select **None** (empty class) or **Actor**
4. Name it anything (e.g., `DummyClass`)
5. Click **Create Class**

### Option B: Manually Create Game Module (if Editor won't open)

Create the following files in your project:

**Source/YourProject/YourProject.Build.cs**
```csharp
using UnrealBuildTool;

public class YourProject : ModuleRules
{
    public YourProject(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        
        PublicDependencyModuleNames.AddRange(new string[] { 
            "Core", 
            "CoreUObject", 
            "Engine",
            "MaestraPlugin"  // Add the plugin as a dependency
        });
    }
}
```

**Source/YourProject/YourProject.h**
```cpp
#pragma once

#include "CoreMinimal.h"
```

**Source/YourProject/YourProject.cpp**
```cpp
#include "YourProject.h"
#include "Modules/ModuleManager.h"

IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, YourProject, "YourProject");
```

> **Note:** Replace `YourProject` with your actual project name in all files.

## Step 3: Generate Visual Studio Project Files

1. Close Unreal Editor if it's open
2. In Windows Explorer, right-click your `.uproject` file
3. Select **Generate Visual Studio project files**
4. Wait for the process to complete (a `.sln` file will be created)

## Step 4: Add Plugin Dependency to Your Game Module

If you used Option A above, you still need to add the plugin dependency:

1. Open `Source/YourProject/YourProject.Build.cs`
2. Add `"MaestraPlugin"` to the `PublicDependencyModuleNames`:

```csharp
PublicDependencyModuleNames.AddRange(new string[] { 
    "Core", 
    "CoreUObject", 
    "Engine",
    "MaestraPlugin"  // Add this line
});
```

## Step 5: Build the Project

1. Open the `.sln` file in Visual Studio
2. In **Solution Explorer**, right-click your project (not the solution) → **Set as Startup Project**
3. Set configuration to **Development Editor** and **Win64**
4. Right-click your project → **Build** (or press Ctrl+Shift+B)

> **Important:** Build only your project, not the entire solution. Building the full solution may try to modify engine files in Program Files and fail with "Access denied" errors.

## Step 6: Create an Actor to Use the Plugin

Create a new Actor class that uses MaestraPlugin:

**Source/YourProject/MaestraTestActor.h**
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MaestraClient.h"
#include "MaestraEntity.h"
#include "MaestraTestActor.generated.h"  // Must be last include

UCLASS()
class YOURPROJECT_API AMaestraTestActor : public AActor
{
    GENERATED_BODY()
    
public:    
    AMaestraTestActor();

protected:
    virtual void BeginPlay() override;

public:    
    virtual void Tick(float DeltaTime) override;

private:
    // Must be UPROPERTY to prevent garbage collection
    UPROPERTY()
    UMaestraClient* MaestraClient;

    // Must be UFUNCTION for delegate binding
    UFUNCTION()
    void OnEntityReceived(const FString& Slug, UMaestraEntity* Entity);
};
```

**Source/YourProject/MaestraTestActor.cpp**
```cpp
#include "MaestraTestActor.h"

AMaestraTestActor::AMaestraTestActor()
{
    PrimaryActorTick.bCanEverTick = true;
    // Do NOT create UObjects here - no world context exists yet
}

void AMaestraTestActor::BeginPlay()
{
    Super::BeginPlay();
    
    UE_LOG(LogTemp, Warning, TEXT("MaestraTestActor: Initializing Maestra Client"));
    
    // Create UObjects in BeginPlay, not in the constructor
    MaestraClient = NewObject<UMaestraClient>(this);
    MaestraClient->Initialize(TEXT("http://localhost:8080"));
    MaestraClient->OnEntityReceived.AddDynamic(this, &AMaestraTestActor::OnEntityReceived);
    MaestraClient->GetEntityBySlug(TEXT("gallery-light-1"));
}

void AMaestraTestActor::OnEntityReceived(const FString& Slug, UMaestraEntity* Entity)
{
    UE_LOG(LogTemp, Warning, TEXT("Received entity: %s"), *Slug);
    
    float Brightness = Entity->GetStateFloat(TEXT("brightness"), 0.0f);
    UE_LOG(LogTemp, Warning, TEXT("Brightness: %f"), Brightness);
}

void AMaestraTestActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
}
```

> **Important:** Replace `YOURPROJECT_API` with your actual project's API macro (e.g., `MAESTRADEMO_API`).

## Step 7: Build and Place the Actor

1. Build your project in Visual Studio
2. Open your project in Unreal Editor
3. Open the **Content Browser**
4. Navigate to **C++ Classes → YourProject**
5. Find `MaestraTestActor` and drag it into your level
6. Click **Play**

## Step 8: View Output Logs

To see your `UE_LOG` messages:

1. In Unreal Editor: **Window → Developer Tools → Output Log**
2. Look for lines containing your log messages

For on-screen debug messages, you can add this to your code:

```cpp
if (GEngine)
{
    GEngine->AddOnScreenDebugMessage(-1, 5.0f, FColor::Green, TEXT("Maestra initialized!"));
}
```

---

## Common Issues and Solutions

### "Incompatible or missing module" when opening project

The plugin hasn't been compiled yet. Generate Visual Studio project files and build from Visual Studio.

### "Cannot open include file" for plugin headers

1. Verify `"MaestraPlugin"` is in your `Build.cs` dependencies
2. Check include order in your header (see below)

### Include order matters

In Unreal, header include order is important:

```cpp
#pragma once

#include "CoreMinimal.h"           // First: Unreal core
#include "GameFramework/Actor.h"   // Second: Parent class
#include "MaestraClient.h"         // Third: Other includes
#include "MaestraEntity.h"
#include "YourClass.generated.h"   // ALWAYS LAST
```

### Crashes or unexpected behavior with UObjects

- **Never** create UObjects with `NewObject<>()` in a constructor
- **Always** create them in `BeginPlay()` or later
- **Always** mark UObject pointers with `UPROPERTY()` or they may be garbage collected

### Delegate binding doesn't work

Callback functions used with `AddDynamic()` must be marked with `UFUNCTION()`:

```cpp
UFUNCTION()
void MyCallback(/* params */);
```

### "Access denied" when building

You're trying to build the entire solution, which includes engine programs. Right-click your project specifically and select **Build**.

### BeginPlay not being called

Your Actor must exist in the level. Either:
- Drag it from Content Browser into your level, or
- Spawn it programmatically from GameMode

---

## Quick Reference: UE5 C++ Patterns

| Pattern | Correct | Incorrect |
|---------|---------|-----------|
| UObject member | `UPROPERTY() UMyClass* Obj;` | `UMyClass* Obj;` |
| Create UObject | In `BeginPlay()`: `NewObject<>(this)` | In constructor |
| Delegate callback | `UFUNCTION() void Callback();` | `void Callback();` |
| Generated header | Last include | Anywhere else |
| Plugin dependency | In `Build.cs` | Only in includes |

---

## Next Steps

Once you have the basic integration working, you can:

- Subscribe to multiple entities
- Update entity state from Unreal
- Create Blueprint-accessible wrapper functions with `UFUNCTION(BlueprintCallable)`
- Build custom components that encapsulate Maestra functionality

See `sdks/unreal/MaestraPlugin/README.md` for more documentation.
