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

## Integration Examples

### TouchDesigner

**Sending OSC to Maestra:**

1. Add an **OSC Out DAT**
2. Configure:
   - Network Address: `<maestra-host>`
   - Network Port: `57120`
   - OSC Address: `/device/sensor/temperature`
3. Send messages via script:

```python
# In a Script DAT
op('oscout1').send('/device/sensor/temperature', [23.5])
```

**Receiving OSC from Maestra:**

1. Add an **OSC In DAT**
2. Configure:
   - Port: `57121`
3. Messages will appear in the DAT

### Max/MSP

**Sending OSC to Maestra:**

```
[23.5(
|
[prepend /device/sensor/temperature]
|
[udpsend <maestra-host> 57120]
```

**Receiving OSC from Maestra:**

```
[udpreceive 57121]
|
[oscparse]
|
[route /lights/brightness]
|
[print]
```

### SuperCollider

**Sending OSC to Maestra:**

```supercollider
~maestra = NetAddr("maestra-host", 57120);

// Send single value
~maestra.sendMsg("/device/sensor/temperature", 23.5);

// Send multiple values
~maestra.sendMsg("/lights/rgb", 255, 128, 64);
```

**Receiving OSC from Maestra:**

```supercollider
OSCdef(\maestraLights, { |msg, time, addr, recvPort|
    msg.postln;  // Print the message
}, '/lights/brightness');

// Listen on port 57121
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
