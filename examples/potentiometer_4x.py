"""
4× Potentiometer → Maestra (Arduino NG + Raspberry Pi)

Reads four potentiometers from an Arduino NG over USB serial and publishes
them to a Maestra entity as pot1-pot4.  The UE5 Aurora project maps these to:

  pot1 — Hue        (aurora color: green → cyan → purple → red)
  pot2 — Intensity   (brightness from dim to blazing)
  pot3 — Height      (curtain vertical extent: stubby → towering)
  pot4 — Turbulence  (wave speed / fold complexity: calm → chaotic)

The Arduino sends a comma-separated line per read cycle:
  "512,1023,0,768\n"

This script normalizes each value from 0-1023 → 0.0-1.0 and sets the
corresponding keys on the entity state.

Arduino NG → Raspberry Pi connection:
  USB-B cable from the Arduino NG to any USB port on the Pi.
  The NG's onboard FT232RL shows up as /dev/ttyUSB0 (FTDI).

Usage:
  pip install pyserial aiohttp
  python potentiometer_4x.py --entity-slug aurora --api-url http://<maestra-host>:8080
"""

import asyncio
import argparse
import sys
import os

import serial

# Allow importing the SDK from the repo when not installed as a package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdks", "python"))

from maestra import MaestraClient, ConnectionConfig

POT_KEYS = ("pot1", "pot2", "pot3", "pot4")
POT_LABELS = ("hue", "intensity", "height", "turbulence")
NUM_POTS = len(POT_KEYS)

# Minimum change in normalized value (0.0-1.0) required to trigger an update.
# 0.01 ≈ 10 ADC counts out of 1023, enough to ignore analog noise/drift.
DEADBAND = 0.01


async def main(
    serial_port: str,
    baud_rate: int,
    entity_slug: str,
    api_url: str,
    interval: float,
    deadband: float,
):
    # Open serial connection to the Arduino NG
    ser = serial.Serial(serial_port, baud_rate, timeout=1)
    print(f"Opened serial port {serial_port} @ {baud_rate} baud")

    # Connect to Maestra
    client = MaestraClient(ConnectionConfig(api_url=api_url, nats_url=None, mqtt_broker=None))
    await client.connect()

    # Look up the target entity
    entity = await client.get_entity_by_slug(entity_slug)
    print(f"Publishing to entity: {entity.name} ({entity.slug})")

    last_values: list[float | None] = [None] * NUM_POTS
    print(f"Deadband threshold: {deadband} (changes smaller than this are ignored)")

    try:
        while True:
            # Read a CSV line from the Arduino (e.g. "512,1023,0,768\r\n")
            raw = ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw:
                await asyncio.sleep(interval)
                continue

            parts = raw.split(",")
            if len(parts) != NUM_POTS:
                continue

            try:
                raw_values = [int(p) for p in parts]
            except ValueError:
                continue

            # Normalize 0-1023 ADC range → 0.0-1.0, only send if change exceeds deadband
            changed = {}
            for i, raw_value in enumerate(raw_values):
                normalized = round(raw_value / 1023.0, 4)
                if last_values[i] is None or abs(normalized - last_values[i]) >= deadband:
                    changed[POT_KEYS[i]] = normalized
                    last_values[i] = normalized

            if changed:
                await entity.state.update(changed, source="potentiometer")
                labels = ", ".join(
                    f"{POT_LABELS[POT_KEYS.index(k)]}={v}" for k, v in changed.items()
                )
                print(f"updated: {labels}")

            await asyncio.sleep(interval)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        ser.close()
        await client.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Read 4 potentiometers via Arduino NG serial and publish to Maestra"
    )
    parser.add_argument(
        "--port", default="/dev/ttyUSB0",
        help="Serial port (default: /dev/ttyUSB0 for FTDI-based Arduino NG)",
    )
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default: 9600)")
    parser.add_argument("--entity-slug", required=True, help="Slug of the Maestra entity to update")
    parser.add_argument("--api-url", default="http://localhost:8080", help="Maestra API URL")
    parser.add_argument("--interval", type=float, default=0.05, help="Read interval in seconds (default: 0.05)")
    parser.add_argument(
        "--deadband", type=float, default=DEADBAND,
        help=f"Minimum normalized change (0.0-1.0) to trigger an update (default: {DEADBAND})",
    )
    args = parser.parse_args()

    asyncio.run(main(args.port, args.baud, args.entity_slug, args.api_url, args.interval, args.deadband))
