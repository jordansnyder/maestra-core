# Maestra Device Router — Claude Code Integration Handoff

## Overview

`maestra-routing.jsx` is a self-contained React component implementing a visual device routing tool with three visualization modes: Node Graph, Matrix Router, and Rack Topology View. It has zero external dependencies beyond React. This document provides instructions for integrating it into the existing Maestra dashboard.

## Component Location

Place `maestra-routing.jsx` into the project at an appropriate location, e.g.:

```
src/components/routing/maestra-routing.jsx
```

## Integration Tasks

### Phase 1: Basic Integration

1. **Add to the dashboard router** — Register as a new page/route (e.g., `/devices` or `/routing`) and add a nav entry to the existing dashboard shell.

2. **Adapt to existing layout** — The component currently renders at `100vw/100vh`. Replace the root container sizing so it fills the dashboard's content area instead of the full viewport.

3. **Match the existing theme system** — Replace inline styles with whatever CSS approach the project uses (Tailwind, CSS modules, styled-components, etc.). Preserve the dark theme color tokens and signal-type color coding:
   - SDI: `#3185FC`
   - HDMI: `#35CE8D`
   - Audio: `#F9A620`
   - Data: `#B56CED`
   - Timecode: `#ADB5BD`
   - Stream: `#FF6B6B`

4. **Wire up state management** — Route state (the `routes` array) and device state (the `DEVICES` array) should be connected to the project's existing state management layer rather than local `useState`.

### Phase 2: Data Layer

5. **Externalize the device registry** — Pull the hardcoded `DEVICES` array out into a data layer or API call. Devices should be dynamic (add/remove/edit). Each device has:
   - `id`, `name`, `type`, `icon`, `color`
   - `inputs[]` — named input ports
   - `outputs[]` — named output ports

6. **Persist routing state** — Save routing configurations to the backend/DB so they survive page reload. A route is defined as:
   ```json
   { "from": "device-id", "fromPort": "port-name", "to": "device-id", "toPort": "port-name" }
   ```

7. **Route presets / snapshots** — Allow users to save and recall named routing configurations (e.g., "Interview Setup", "Live Stream Config", "Multicam Record").

### Phase 3: Validation & Polish

8. **Signal compatibility validation** — Warn users when connecting incompatible signal types (e.g., timecode output to video input). Decide whether to hard-block or soft-warn. Consider that physical converters (SDI↔HDMI) make some cross-type connections valid.

9. **Routing loop detection** — Detect and warn on circular signal paths that would cause feedback or infinite loops.

10. **Port capacity enforcement** — Decide and enforce whether outputs support 1:1 or 1:N fanout (one output to multiple inputs). Physical signals are typically 1:1 without a DA; data/AI signals can fan out.

11. **Responsive design** — The Matrix Router view needs special attention for smaller viewports. Consider horizontal scrolling with sticky row headers, or a filtered/collapsed mode. The Node Graph should support pinch-to-zoom on touch devices.

## Architecture Notes

- The component exports a single default React functional component (`MaestraRouter`) with no required props.
- All three views (Node Graph, Matrix, Rack) share the same `routes` state array — changes in one view are immediately reflected in the others.
- Signal type is inferred from port names via `getSignalType()`. If the data model evolves to include explicit signal type metadata on ports, replace this heuristic.
- The Node Graph view uses SVG for cable rendering and absolutely-positioned divs for device nodes. For large device counts (50+), consider migrating to a canvas-based renderer.
- The `SIGNAL_TYPES` constant defines the color coding and labels for the signal type legend. This should be kept consistent across all views and any future views.

## File Reference

- `maestra-routing.jsx` — The complete component (included alongside this document)
