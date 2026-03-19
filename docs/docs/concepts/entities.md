# Entities & State

## What is an entity?

An **entity** is anything in your experience that has data you want to share — a light, a sensor, a projection surface, a speaker, a room, or an entire building. Think of it as a named container for values that any connected device can read and write.

For example, a light entity might hold:

```json
{
  "brightness": 75,
  "color": "#ff3300",
  "on": true
}
```

An Arduino can set the brightness. TouchDesigner can read the color. A phone can toggle it on and off. Every change is sent to all connected devices instantly.

## State: the values inside an entity

An entity's **state** is its current set of values. State is stored as key-value pairs where:

- **Keys** are names you choose (like `brightness`, `color`, `temperature`)
- **Values** can be numbers, text, true/false, colors, positions, or nested objects

### Reading state

Every SDK lets you read state the same way — get the entity, then access its values:

=== "TouchDesigner"
    ```python
    brightness = ext.Get('brightness', 0)
    ```

=== "Python"
    ```python
    brightness = entity.state.get("brightness", 0)
    ```

=== "JavaScript"
    ```javascript
    const brightness = light.state.get('brightness')
    ```

=== "Unity"
    ```csharp
    float brightness = entity.GetFloat("brightness", 0f);
    ```

=== "Arduino"
    ```cpp
    int brightness = state["brightness"];
    ```

### Updating state

When you update state, you can either **merge** (change some values, keep the rest) or **replace** (set the entire state to new values):

- **Merge**: `{ "brightness": 50 }` — only changes brightness, everything else stays the same
- **Replace**: `{ "brightness": 50 }` — sets brightness to 50 and removes all other values

Most of the time you want merge, and that's the default in every SDK.

### Live updates

When any device changes an entity's state, every other device watching that entity receives the new values automatically. You don't need to poll or refresh — updates arrive in milliseconds.

## Organizing entities in a hierarchy

Entities can be arranged in a tree, like folders on a computer. This is useful for organizing large installations:

```
building
  building.floor1
    building.floor1.roomA
      building.floor1.roomA.light1
      building.floor1.roomA.light2
    building.floor1.roomB
      building.floor1.roomB.projector1
```

This lets you do things like "turn off all lights on floor 1" or "get every entity in room A" with a single request.

## Entity variables (typed fields)

For more structured projects, you can define **variables** on an entity — typed input and output fields that describe what the entity expects and provides. Available types include:

`string` · `number` · `boolean` · `color` · `vector2` · `vector3` · `range` · `enum` · `array` · `object`

Variables are optional. Simple projects work fine with plain state keys. Variables become useful when you want validation, discoverability, or when building UI that adapts to entity types.

??? info "Technical details"
    - Entity state is persisted in **PostgreSQL** and cached in **Redis** for fast reads
    - State changes are broadcast over **NATS** and **MQTT** simultaneously
    - The hierarchy uses PostgreSQL's **LTREE** extension for efficient tree queries
    - State history is stored in a **TimescaleDB hypertable** with automatic partitioning
    - You can query state history, ancestors, and descendants through the [Entities API](../api/entities.md)

## Next steps

- [Connect Your Tool](../connect/touchdesigner.md) — get your creative software connected
- [Streams](streams.md) — share video, audio, and data feeds between devices
- [Routing](routing.md) — automatically patch signals between entities
- [Entities API Reference](../api/entities.md) — full REST API documentation
