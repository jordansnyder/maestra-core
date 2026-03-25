# OSC Gateway API

The OSC (Open Sound Control) Gateway bridges OSC messages from creative tools like TouchDesigner, Max/MSP, SuperCollider, and other OSC-enabled applications to the Maestra message bus (NATS).

## Configuration

The gateway listens for incoming OSC messages and can send outgoing OSC messages:

- **OSC_IN_PORT**: UDP port for receiving OSC (default: 57120)
- **OSC_OUT_PORT**: UDP port for sending OSC (default: 57121)

Set these in your `.env` file:

```bash
OSC_IN_PORT=57120
OSC_OUT_PORT=57121
```

## OSC → NATS (Incoming)

OSC messages received by the gateway are automatically published to NATS.

### Address Transformation

OSC addresses are converted to NATS subjects:

```
OSC: /device/sensor/temperature
 ↓
NATS: maestra.osc.device.sensor.temperature
```

### Message Format

```json
{
  "timestamp": "2026-02-02T12:34:56.789Z",
  "source": "osc",
  "address": "/device/sensor/temperature",
  "values": [23.5, "celsius"]
}
```

## NATS → OSC (Outgoing)

To send OSC messages from Maestra, publish to `maestra.to_osc.*` topics.

### Publishing from NATS

```python
import asyncio
import nats
import json

async def send_osc():
    nc = await nats.connect("nats://localhost:4222")

    message = {
        "address": "/lights/brightness",
        "values": [75, 100],
        "target": "127.0.0.1"  # Optional, defaults to 127.0.0.1
    }

    await nc.publish(
        "maestra.to_osc.lights",
        json.dumps(message).encode()
    )

    await nc.close()

asyncio.run(send_osc())
```

## Entity State via OSC

The OSC Gateway integrates with Maestra's entity state system, allowing OSC messages to update entity state and receive entity state broadcasts. This means OSC-based installations can participate fully in the Maestra ecosystem alongside MQTT, WebSocket, and HTTP clients.

### OSC → Entity State (Inbound)

Send OSC messages to reserved addresses to update entity state. The gateway publishes to the same NATS subjects that the StateManager listens on, so state updates flow through the database, get recorded in history, and broadcast to all connected devices.

#### Format A: Single-Key Shorthand (Recommended)

The most natural OSC pattern. Put the entity slug and state key in the address:

```
/entity/update/<slug>/<key>  <value>
```

Examples:

```
/entity/update/rgb-light/brightness  128
/entity/update/rgb-light/on  1
/entity/update/sensor-1/temperature  23.5
```

Nested keys are supported with additional path segments:

```
/entity/update/rgb-light/color/r  255
→ state: {"color": {"r": 255}}
```

Use `/entity/set/` instead of `/entity/update/` for full state replacement (PUT semantics).

#### Format B: Multi-Key Update

Send multiple key-value pairs as alternating arguments:

```
/entity/update/<slug>  <key1> <val1> <key2> <val2> ...
```

Example:

```
/entity/update/rgb-light  brightness  128  on  1
→ state: {"brightness": 128, "on": 1}
```

#### Format C: JSON Blob

Send a JSON string as a single argument for complex nested state:

```
/entity/update/<slug>  '{"brightness": 128, "color": {"r": 255, "g": 128, "b": 64}}'
```

### Entity State → OSC (Outbound)

When entity state changes from any source (API, MQTT, WebSocket, etc.), the gateway sends OSC messages to configured targets.

#### Configuration

Set `OSC_TARGETS` in your `.env` file (comma-separated `ip:port`):

```bash
OSC_TARGETS=192.168.1.10:57121,192.168.1.20:57121
```

#### Output Format

For each state change, two types of OSC messages are sent:

**Per-key messages** (one per changed key):

```
/entity/state/<type>/<slug>/<key>  <value>
```

Example: `/entity/state/light/rgb-light/brightness 128`

**Full-state message** (one per event):

```
/entity/state/<type>/<slug>  <json-string>
```

Loop prevention: state changes originating from OSC (`source: "osc"`) are not echoed back out.

### Address Mapping File

For installations with fixed OSC addresses that can't be changed, create a mapping file at `config/osc-gateway/mappings.json`:

```json
[
  {
    "osc_address": "/sensor/1/value",
    "entity_slug": "sensor-1",
    "state_key": "temperature",
    "operation": "update"
  },
  {
    "osc_address": "/kinect/hand/position",
    "entity_slug": "tracker-hand",
    "state_keys": ["x", "y", "z"],
    "operation": "update"
  }
]
```

- `state_key`: maps a single OSC argument to one state key
- `state_keys`: maps positional OSC arguments to named keys in order
- `operation`: `"update"` (merge, default) or `"set"` (replace)

See `config/osc-gateway/mappings.json.example` for more examples.

### Testing Entity State

```bash
# Send a single-key entity state update via OSC
make test-osc-state SLUG=my-entity

# Check gateway logs
make logs-service SERVICE=osc-gateway

# Check fleet-manager logs for state processing
make logs-service SERVICE=fleet-manager
```

## Integration Examples

### TouchDesigner

**Sending OSC to Maestra:**

```python
# In a Script DAT or Execute DAT
n = op('oscout1')

# Generic OSC
n.send('/device/sensor/temperature', [23.5])

# Entity state update (single key)
n.send('/entity/update/my-sensor/temperature', [23.5])

# Entity state update (multiple keys)
n.send('/entity/update/rgb-light', ['brightness', 128, 'on', 1])
```

**Receiving entity state via OSC** (set `OSC_TARGETS` to include your TD machine):

```python
# In an OSC In DAT callback
def onReceiveOSC(dat, rowIndex, message, bytes, timeStamp, address, args, peer):
    # Per-key: /entity/state/light/rgb-light/brightness 128
    if address.startswith('/entity/state/'):
        parts = address.split('/')
        entity_type, slug, key = parts[3], parts[4], parts[5]
        value = args[0]
        # Use the value in your network
```

### Max/MSP

**Sending entity state updates:**

```
[128(
|
[prepend /entity/update/rgb-light/brightness]
|
[udpsend <maestra-host> 57120]
```

**Receiving entity state via OSC** (set `OSC_TARGETS` to include your Max machine):

```
[udpreceive 57121]
|
[oscparse]
|
[route /entity/state/light/rgb-light]
|
[route /brightness /on /color]
|
[print]
```

### SuperCollider

**Sending entity state updates:**

```supercollider
~maestra = NetAddr("maestra-host", 57120);

// Single-key entity state update
~maestra.sendMsg("/entity/update/my-synth/frequency", 440.0);
~maestra.sendMsg("/entity/update/my-synth/amplitude", 0.8);

// Generic OSC (not entity state, just forwarded to NATS)
~maestra.sendMsg("/audio/analysis/rms", 0.42);
```

**Receiving entity state via OSC** (set `OSC_TARGETS` to include your SC machine):

```supercollider
OSCdef(\entityState, { |msg, time, addr, recvPort|
    msg.postln;
}, '/entity/state/synth/my-synth/frequency');

thisProcess.openUDPPort(57121);
```

### Python (python-osc)

**Sending OSC to Maestra:**

```python
from pythonosc import udp_client

client = udp_client.SimpleUDPClient("localhost", 57120)
client.send_message("/device/sensor/temperature", [23.5, "celsius"])
```

**Receiving OSC from Maestra:**

```python
from pythonosc import dispatcher, osc_server

def handle_brightness(address, *args):
    print(f"Brightness: {args[0]}")

disp = dispatcher.Dispatcher()
disp.map("/lights/brightness", handle_brightness)

server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 57121), disp)
print("Listening for OSC on port 57121")
server.serve_forever()
```

## Docker Networking

### From Inside Docker

Use the service name:

```python
# Python example
client = udp_client.SimpleUDPClient("osc-gateway", 57120)
```

### From Host Machine

Use `localhost`:

```python
# Python example
client = udp_client.SimpleUDPClient("localhost", 57120)
```

### From External Device

Use the host machine's IP address:

```python
# Python example
client = udp_client.SimpleUDPClient("192.168.1.100", 57120)
```

Make sure port 57120 is accessible through your firewall.

## Common OSC Patterns

### Sensor Data

```
/device/sensor1/temperature  23.5
/device/sensor1/humidity     65.2
/device/sensor1/pressure     1013.25
```

### Light Control

```
/lights/1/brightness  75
/lights/1/rgb         255 128 64
/lights/1/on          1
```

### Position Tracking

```
/tracker/person1/position  1.5 2.3 0.8
/tracker/person1/rotation  0.0 45.0 0.0
```

### Multi-Parameter Updates

```
/scene/parameters  0.5 0.8 100 "auto"
```

## Performance Notes

- **Protocol**: OSC uses UDP (connectionless, low latency)
- **Throughput**: Can handle ~10,000 messages/second
- **Packet Size**: Keep OSC messages under 1500 bytes to avoid fragmentation
- **No Acknowledgment**: UDP doesn't guarantee delivery (design for occasional packet loss)
- **Ordering**: Messages may arrive out of order

## Wildcard Matching

OSC supports wildcard patterns in addresses:

```
/lights/*/brightness     # Matches /lights/1/brightness, /lights/2/brightness, etc.
/lights/[1-4]/rgb        # Matches /lights/1/rgb through /lights/4/rgb
/device/{sensor,actuator}/value  # Matches sensor or actuator
```

These patterns work when subscribing in your OSC client application.

## Troubleshooting

### Messages Not Received

1. **Check firewall rules** - UDP ports 57120/57121 must be open
2. **Verify IP address** - Use `ifconfig` or `ipconfig` to get correct host IP
3. **Test with simple tool** - Use `osculator` or `protokol` to verify OSC messages
4. **Check Docker port mapping** - Ensure ports are mapped in `docker-compose.yml`

### View Gateway Logs

```bash
make logs-service SERVICE=osc-gateway
```

### Test OSC Connection

From host machine:

```bash
# Install python-osc
pip install python-osc

# Send test message
python3 -c "
from pythonosc import udp_client
client = udp_client.SimpleUDPClient('localhost', 57120)
client.send_message('/test/message', [42, 'hello'])
print('Sent OSC message to /test/message')
"
```

Check logs to verify the message was received:

```bash
make logs-service SERVICE=osc-gateway
```

You should see:
```
📨 OSC received: /test/message (42, 'hello')
✅ Published to NATS: maestra.osc.test.message
```

## Security Considerations

**Development Mode**: OSC Gateway accepts messages from any source IP address.

**Production Recommendations**:
- Configure firewall rules to allow only trusted IPs
- Use VPN for remote OSC devices
- Consider using OSC over TCP for reliability (requires custom implementation)
- Add rate limiting to prevent abuse
- Monitor for unexpected message patterns

## Advanced Usage

### Bidirectional Communication

Subscribe to NATS topics in your application and send responses via OSC:

```python
import asyncio
import nats
import json
from pythonosc import udp_client

async def bidirectional():
    # Connect to NATS
    nc = await nats.connect("nats://localhost:4222")

    # OSC client for responses
    osc = udp_client.SimpleUDPClient("localhost", 57121)

    async def handle_osc_message(msg):
        data = json.loads(msg.data.decode())
        address = data['address']
        values = data['values']

        print(f"Received: {address} {values}")

        # Send response via OSC
        if address == "/request/status":
            osc.send_message("/response/status", ["ready"])

    # Subscribe to OSC messages from gateway
    await nc.subscribe("maestra.osc.>", cb=handle_osc_message)

    await asyncio.Event().wait()

asyncio.run(bidirectional())
```

### Message Filtering

Filter by OSC address pattern:

```python
async def handle_sensor_only(msg):
    data = json.loads(msg.data.decode())
    if data['address'].startswith('/device/sensor'):
        print(f"Sensor data: {data}")

await nc.subscribe("maestra.osc.device.sensor.>", cb=handle_sensor_only)
```

## Related Documentation

- [WebSocket Gateway](websocket.md) - Browser WebSocket gateway
- [Fleet Manager API](fleet-manager.md) - REST API for entity management
- [MQTT Integration Guide](../guides/mqtt.md) - MQTT protocol guide
- [TouchDesigner SDK](../sdks/touchdesigner.md) - TouchDesigner integration details
