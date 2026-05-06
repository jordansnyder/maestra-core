# Using the Dashboard

The Maestra Dashboard is a web interface for managing your project. Open it in any browser to see your devices, entities, and their current state — no code required.

## Opening the Dashboard

Open your browser and go to your Maestra server address on port 3001:

- **Local setup:** [http://localhost:3001](http://localhost:3001)
- **Network setup:** `http://<your-maestra-ip>:3001` (ask your admin for the address)

## What you can do

### Browse entities

The **Entities** page shows every entity in your project. Click any entity to see its current state — all the values it holds right now. You can see at a glance which entities are active and what data they contain.

### Create and edit entities

Click **+ Create Entity** to add a new entity. Give it a name, choose a type, and optionally set some initial state values. You can also edit existing entities — change their display name, type, or state directly from the browser. The entity's slug (used as its API and message-bus identifier) is set at creation time and does not change when you rename it.

### Watch live state changes

Entity state updates in real time. If someone changes a value from TouchDesigner, Arduino, or any other connected device, you'll see it update in the Dashboard immediately. This makes the Dashboard a great debugging tool — you can watch data flow through your system as it happens.

### View devices

The **Devices** page shows all connected devices, their status (online/offline), and when they last checked in. This is useful for confirming that your hardware is connected and communicating.

### Manage signal routing

The Dashboard includes a visual canvas for building signal routes — connecting entity outputs to inputs. Drag connections between entities to set up automatic data flow without writing code.

### Monitor streams

See all active streams (video, audio, sensor data) currently being shared between devices. The Dashboard shows who's publishing, who's consuming, and connection status.

## Tips

- **Keep it open during development** — the Dashboard is the easiest way to confirm that your devices are connected and data is flowing correctly
- **Use it for quick edits** — need to tweak a value? Edit the entity state directly instead of going back to your code
- **Check devices first** — if something isn't working, the Devices page will tell you whether your hardware is actually connected

## Related

- [Entities & State](../concepts/entities.md) — understand what you're looking at in the Dashboard
- [Routing](../concepts/routing.md) — how signal routing works
- [Monitoring & Grafana](monitoring.md) — for deeper performance metrics and historical data
