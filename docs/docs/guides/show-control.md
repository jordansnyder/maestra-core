# Show Control Guide

Control the lifecycle of your entire installation from one place. Press a button and every connected device responds.

## Quick Start

1. Open the Maestra Dashboard at `http://localhost:3001/show-control`
2. Press **WARMUP** to enter pre-show mode
3. Press **GO** to start the show
4. Press **PAUSE** to temporarily halt (all devices hold current state)
5. Press **STOP** to end the show
6. Press **RESET** to return to idle

## How It Works

Show control uses a single "show" entity that broadcasts its state to every protocol Maestra supports. When you press GO on the dashboard, every device listening via NATS, MQTT, OSC, or WebSocket receives the state change within milliseconds.

The state machine prevents invalid transitions (you can't skip from idle to active, you must go through pre_show first). Side effects fire automatically (shutdown triggers DMX blackout, for example).

## Responding to Show State in Your Code

### Python
```python
from maestra.show import ShowControl

show = ShowControl(transport)
state = await show.get_state()
print(f"Show is: {state['phase']}")

# Subscribe to changes
await show.on_change(lambda state: print(f"Phase: {state['phase']}"))
```

### JavaScript
```javascript
import { ShowControl } from '@maestra/sdk'

const show = new ShowControl('http://localhost:8080')
const state = await show.getState()
console.log(`Show is: ${state.phase}`)
```

### Arduino (MQTT)
```cpp
void setup() {
  maestra.begin();
  // Show state is automatically tracked via MQTT subscription
}

void loop() {
  maestra.loop();

  if (maestra.isShowActive()) {
    // Show is running — do your thing
  } else if (maestra.isShowPaused()) {
    // Show is paused — hold current state
  }
}
```

### TouchDesigner
```python
# In your MaestraExt extension
def onShowChange(self, phase, previousPhase):
    if phase == 'active':
        op('moviefilein1').par.play = True
    elif phase == 'paused':
        op('moviefilein1').par.play = False
    elif phase == 'shutdown':
        op('moviefilein1').par.play = False
```

### OSC (from QLab, Isadora, etc.)
```
# Send from QLab to trigger show transitions:
/show/go          → starts the show
/show/pause       → pauses the show
/show/shutdown    → emergency shutdown

# Receive show state on your OSC targets:
/entity/state/show_control/show/phase "active"
```

## Scheduling

Automate your show for unattended installations (museums, galleries).

```bash
# Create a weekday schedule
curl -X POST http://localhost:8080/show/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gallery Hours",
    "timezone": "America/New_York",
    "entries": [
      {"cron": "45 9 * * 1-5", "transition": "pre_show"},
      {"cron": "0 10 * * 1-5", "transition": "active"},
      {"cron": "0 18 * * 1-5", "transition": "shutdown"}
    ]
  }'
```

The schedule evaluates every 60 seconds. If Fleet Manager restarts, it catches up by checking what transition should have most recently fired.

## Configuring Side Effects

By default, show transitions trigger DMX-related side effects:
- Shutdown → DMX blackout + playback stop
- Pause → DMX output pause
- Resume → DMX output resume

You can add custom side effects via the API:

```bash
# Publish a NATS message when the show starts
curl -X POST http://localhost:8080/show/side-effects \
  -H "Content-Type: application/json" \
  -d '{
    "from_phase": "pre_show",
    "to_phase": "active",
    "action_type": "nats_publish",
    "action_config": {"subject": "maestra.custom.show-started", "payload": {"started": true}},
    "description": "Notify custom systems when show starts"
  }'
```

## Security

For installations on shared networks, set `SHOW_CONTROL_TOKEN` in your `.env`:

```
SHOW_CONTROL_TOKEN=your-secret-token
```

All transition endpoints will then require `Authorization: Bearer your-secret-token`.
