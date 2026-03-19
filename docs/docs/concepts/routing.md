# Routing

## What is routing?

**Routing** is like a virtual patch bay. It lets you connect the output of one entity to the input of another, so data flows automatically between them — no custom code required.

For example:

- Connect a temperature sensor's output to a light's color input, so the light changes color based on the temperature
- Connect a motion sensor to a sound trigger, so a sound plays when someone walks by
- Connect a master brightness control to every light in a room at once

## How it works

Routes are simple connections: **source entity → destination entity**. When the source entity's state changes, the connected values are automatically sent to the destination.

You can create and manage routes through:

- **The Dashboard** — a visual interface where you drag connections between entities
- **The REST API** — programmatic control for more complex setups
- **Node-RED** — visual flow programming for conditional or transformed routing

## When to use routing vs. other approaches

| Approach | Best for |
|----------|----------|
| **Routing** | Direct signal patching — "this value drives that value" |
| **Entity state** | Shared data that multiple devices read independently |
| **Streams** | High-bandwidth continuous data (video, audio, textures) |
| **Node-RED** | Complex logic — "if this, then that" with conditions and transforms |

??? info "Technical details"
    - Routes are defined through the Fleet Manager API and stored in PostgreSQL
    - Route evaluation happens server-side, so devices don't need to know about each other
    - The Dashboard provides a visual canvas for building signal flows
    - Routes can be created, updated, and deleted at runtime without restarting anything

## Next steps

- [Entities & State](entities.md) — the data that flows through routes
- [Events & Messages](events.md) — the messaging system that powers routing under the hood
- [Using the Dashboard](../guides/dashboard.md) — visually build and manage routes
