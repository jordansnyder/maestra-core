"""
Potentiometer → Maestra (Arduino NG + Raspberry Pi)

The Arduino NG reads a potentiometer on A0 and sends the raw ADC value
over USB serial. This script runs on a Raspberry Pi, reads those values,
and publishes them to a Maestra entity.

Arduino NG → Raspberry Pi connection:
  USB-B cable from the Arduino NG to any USB port on the Pi.
  The NG's onboard FT232RL shows up as /dev/ttyUSB0 (FTDI).

Usage:
  pip install pyserial aiohttp
  python potentiometer.py --entity-slug my-knob --api-url http://<maestra-host>:8080
"""

import asyncio
import argparse
import sys
import os

import serial

# Allow importing the SDK from the repo when not installed as a package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdks", "python"))

from maestra import MaestraClient, ConnectionConfig


async def main(
    serial_port: str,
    baud_rate: int,
    entity_slug: str,
    api_url: str,
    interval: float,
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

    last_value = None

    try:
        while True:
            # Read a line from the Arduino (e.g. "512\r\n")
            raw = ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw:
                await asyncio.sleep(interval)
                continue

            try:
                raw_value = int(raw)
            except ValueError:
                continue

            # Normalize 0-1023 ADC range → 0.0-1.0
            normalized = round(raw_value / 1023.0, 4)

            # Only send when the value actually changes
            if normalized != last_value:
                await entity.state.set("value", normalized, source="potentiometer")
                last_value = normalized
                print(f"raw={raw_value}  normalized={normalized}")

            await asyncio.sleep(interval)

    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        ser.close()
        await client.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Read a potentiometer via Arduino NG serial and publish to Maestra"
    )
    parser.add_argument(
        "--port", default="/dev/ttyUSB0",
        help="Serial port (default: /dev/ttyUSB0 for FTDI-based Arduino NG)",
    )
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default: 9600)")
    parser.add_argument("--entity-slug", required=True, help="Slug of the Maestra entity to update")
    parser.add_argument("--api-url", default="http://localhost:8080", help="Maestra API URL")
    parser.add_argument("--interval", type=float, default=0.05, help="Read interval in seconds (default: 0.05)")
    args = parser.parse_args()

    asyncio.run(main(args.port, args.baud, args.entity_slug, args.api_url, args.interval))
