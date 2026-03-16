# Raspberry Pi

Connect a Raspberry Pi to Maestra using the Python SDK.

## What you need

- **Raspberry Pi** (any model with WiFi or Ethernet)
- **Python 3.8+** (pre-installed on Raspberry Pi OS)
- **The Maestra server address** — ask your technical director or admin (e.g., `http://192.168.1.10:8080`)
- The Pi and the Maestra server must be on the **same network**

!!! note "Running Maestra on your own machine?"
    If Maestra is running locally, use your computer's local IP address (not `localhost` — the Pi needs a real network address). See [Setting Up Maestra](../setup/installation.md) for installation instructions.

## Step 1: Install the SDK

```bash
pip install maestra
```

## Step 2: Read and send data

Create a Python script on your Pi:

```python
import asyncio
from maestra import MaestraClient

async def main():
    client = MaestraClient("http://192.168.1.10:8080")  # Your Maestra address
    await client.connect()

    sensor = await client.get_entity("room-sensor")

    # Send a sensor reading
    await sensor.update_state({"temperature": 23.5, "humidity": 65})

    # Listen for commands from other devices
    sensor.on_state_change(lambda state, keys:
        print(f"Received update: {keys}")
    )

    # Keep running
    await asyncio.Event().wait()

asyncio.run(main())
```

## Step 3: Run on boot (optional)

To start your script automatically when the Pi powers on, create a systemd service:

```bash
sudo nano /etc/systemd/system/maestra-sensor.service
```

```ini
[Unit]
Description=Maestra Sensor
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/maestra_sensor.py
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl enable maestra-sensor
sudo systemctl start maestra-sensor
```

## Using GPIO pins

Combine Maestra with the `gpiozero` library to control LEDs, servos, or read physical sensors:

```python
from gpiozero import LED, Button
from maestra import MaestraClient

led = LED(17)
button = Button(27)

async def main():
    client = MaestraClient("http://192.168.1.10:8080")
    await client.connect()

    entity = await client.get_entity("gallery-light-1")

    # Turn LED on/off based on entity state
    entity.on_state_change(lambda state, keys:
        led.on() if state.get("on") else led.off()
    )

    # Send button presses to Maestra
    button.when_pressed = lambda:
        asyncio.run_coroutine_threadsafe(
            entity.update_state({"button_pressed": True}),
            asyncio.get_event_loop()
        )

    await asyncio.Event().wait()
```

## Next steps

- [Entities & State](../concepts/entities.md) — understand what entities are and how state works
- [Python SDK Reference](../sdks/python.md) — full API details
- [Arduino / ESP32](arduino.md) — if you need something smaller and cheaper than a Pi
