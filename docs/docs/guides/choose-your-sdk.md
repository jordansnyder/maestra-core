# Choose Your SDK

Maestra works with the tools you already use. Find your tool below to get started.

Every SDK lets you connect to entities, read and write state, and subscribe to real-time changes. Some SDKs support additional features like streams and direct NATS messaging. The [comparison table](#comparison-table) at the bottom shows exactly what each SDK can do.

---

## TouchDesigner

Use the **Python SDK** with TouchDesigner's built-in Python environment, or the **TouchDesigner extension** for tighter integration with CHOPs and DATs.

**Install the extension:**

Copy `MaestraExt.py` from `sdks/touchdesigner/` into your project's `scripts` folder.

**Hello World:**

```python
# In a TouchDesigner script
maestra = op('maestra').ext.MaestraExt
maestra.Initialize('my-light', 'http://localhost:8080')

# Read state
brightness = maestra.Get('brightness', 0)

# Update state
maestra.UpdateState({'brightness': 75, 'color': '#ff0000'})
```

Full documentation: [TouchDesigner SDK](../sdks/touchdesigner.md)

---

## Max/MSP

Use the **Max/MSP abstractions** to send and receive entity state over OSC.

**Install:**

Copy the abstractions from `sdks/maxmsp/` into your Max search path.

**Hello World:**

```
[maestra.entity @slug my-light @host localhost @port 57120]
|
[dict.unpack brightness: color:]
|         |
[number]  [swatch]
```

Full documentation: [Max/MSP SDK](../sdks/max-msp.md)

---

## Unity

Use the **Unity C# package** for coroutine-based entity management with native Unity types (Vector3, Color).

**Install:**

In Unity, open Window > Package Manager, click +, choose "Add package from git URL", and enter:

```
https://github.com/maestra/maestra-core.git?path=sdks/unity
```

**Hello World:**

```csharp
using Maestra;

// In your MonoBehaviour
var client = gameObject.AddComponent<MaestraClient>();
client.apiUrl = "http://localhost:8080";
client.Initialize();

client.OnEntityReceived += (entity) => {
    float brightness = entity.GetFloat("brightness", 100f);
    Color color = entity.GetColor("color", Color.white);
};
client.GetEntityBySlug("my-light");
```

Full documentation: [Unity SDK](../sdks/unity.md)

---

## Unreal Engine

Use the **Unreal Plugin** with full Blueprint support and C++ access for entity state management.

**Install:**

Copy the `MaestraPlugin` folder from `sdks/unreal/` into your project's `Plugins/` directory. Enable it in Edit > Plugins.

**Hello World (Blueprint):**

```
BeginPlay
  -> Construct MaestraClient
  -> Initialize (ApiUrl: "http://localhost:8080")
  -> GetEntityBySlug (Slug: "my-light")

OnEntityReceived
  -> GetStateFloat (Key: "brightness")
  -> Set Light Intensity
```

**Hello World (C++):**

```cpp
#include "MaestraClient.h"

MaestraClient = NewObject<UMaestraClient>();
MaestraClient->Initialize(TEXT("http://localhost:8080"));
MaestraClient->OnEntityReceived.AddDynamic(this, &AMyActor::OnEntityReceived);
MaestraClient->GetEntityBySlug(TEXT("my-light"));
```

Full documentation: [Unreal Engine SDK](../sdks/unreal.md)

---

## Web / React / Mobile

Use the **JavaScript SDK** for browser apps, React projects, Node.js services, or any JavaScript/TypeScript environment.

**Install:**

```bash
npm install @maestra/sdk
```

**Hello World:**

```typescript
import { MaestraClient } from '@maestra/sdk'

const client = new MaestraClient({
  apiUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8765',
})
await client.connect()

const light = await client.getEntityBySlug('my-light')
console.log('Brightness:', light.state.get('brightness'))

light.state.onChange((event) => {
  console.log('State changed:', event.current_state)
})
await light.subscribe()
```

Full documentation: [JavaScript SDK](../sdks/javascript.md)

---

## Arduino / ESP32

Use the **Arduino SDK** to connect microcontrollers over MQTT. Works with any board that supports WiFi and the PubSubClient library.

**Install (PlatformIO):**

Add to your `platformio.ini`:

```ini
lib_deps =
    https://github.com/maestra/maestra-core#main
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0.0
```

**Hello World:**

```cpp
#include <MaestraClient.h>

WiFiClient wifiClient;
MaestraClient maestra(wifiClient);

void setup() {
    WiFi.begin("your-ssid", "your-password");
    while (WiFi.status() != WL_CONNECTED) delay(500);

    maestra.setBroker("192.168.1.100", 1883);
    maestra.setClientId("my-esp32");
    maestra.connect();

    maestra.subscribeEntity("my-light");
}

void loop() {
    maestra.loop();
}
```

Full documentation: [Arduino SDK](../sdks/arduino.md)

---

## Python Scripting

Use the **Python SDK** for scripts, data pipelines, automation, or any Python application.

**Install:**

```bash
pip install maestra[all]
```

**Hello World:**

```python
import asyncio
from maestra import MaestraClient, ConnectionConfig

async def main():
    client = MaestraClient(ConnectionConfig(
        api_url="http://localhost:8080",
        nats_url="nats://localhost:4222",
    ))
    await client.connect()

    light = await client.get_entity_by_slug("my-light")
    print(f"Brightness: {light.state.get('brightness')}")

    await light.state.update({"brightness": 75})
    await client.disconnect()

asyncio.run(main())
```

Full documentation: [Python SDK](../sdks/python.md)

---

## Just Exploring?

You do not need an SDK to get started. Maestra includes built-in tools for exploring and controlling your system:

- **Dashboard** ([localhost:3001](http://localhost:3001)) -- Browse devices and entities, view and edit state, monitor streams, all from your browser.
- **Node-RED** ([localhost:1880](http://localhost:1880)) -- Build automation flows with drag-and-drop nodes. Connect MQTT inputs to HTTP outputs, process data, trigger actions -- no code required.
- **API Docs** ([localhost:8080/docs](http://localhost:8080/docs)) -- Interactive Swagger UI where you can try every API endpoint directly.
- **Grafana** ([localhost:3000](http://localhost:3000)) -- Monitor device health, message throughput, and entity state history with pre-built dashboards.

---

## Comparison Table

| Feature | Python | JavaScript | Unity | Unreal | Arduino | TouchDesigner | Max/MSP |
|---|---|---|---|---|---|---|---|
| Entity state (read/write) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Real-time subscriptions | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Streams (advertise/discover) | Yes | Yes | Yes | Yes | MQTT only | Yes | -- |
| Stream sessions (P2P) | Yes | Yes | Yes | Yes | MQTT only | Yes | -- |
| Events (pub/sub) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Entity hierarchy queries | Yes | Yes | Yes | Yes | -- | -- | -- |
| Connection protocol | NATS / MQTT | WebSocket / MQTT | HTTP | HTTP | MQTT | HTTP / OSC | OSC |
| Async support | Native async | Promise-based | Coroutines | Async HTTP | Polling | Synchronous | -- |

**Legend:** "MQTT only" means the feature works through MQTT pub/sub topics rather than the full HTTP API. "--" means the feature is not yet available in that SDK.
