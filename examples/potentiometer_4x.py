"""
4x Potentiometer -> Maestra (Arduino NG + Raspberry Pi)

Reads four potentiometers from an Arduino NG over USB serial and publishes
them to a Maestra entity as pot1-pot4.  The UE5 Aurora project maps these to:

  pot1 -- Hue        (aurora color: green -> cyan -> purple -> red)
  pot2 -- Intensity   (brightness from dim to blazing)
  pot3 -- Height      (curtain vertical extent: stubby -> towering)
  pot4 -- Turbulence  (wave speed / fold complexity: calm -> chaotic)

The Arduino sends a comma-separated line per read cycle:
  "512,1023,0,768\n"

This script normalizes each value from 0-1023 -> 0.0-1.0 and sets the
corresponding keys on the entity state.

Arduino NG -> Raspberry Pi connection:
  USB-B cable from the Arduino NG to any USB port on the Pi.
  The NG's onboard FT232RL shows up as /dev/ttyUSB0 (FTDI).

Resilience:
  - Auto-detects Arduino on /dev/ttyUSB* or /dev/ttyACM* if --port is not set
  - Reconnects automatically if the Arduino is unplugged mid-run
  - Retries Maestra API connection on startup with backoff
  - Tolerates transient API errors without crashing

Usage:
  pip install pyserial aiohttp
  python potentiometer_4x.py --entity-slug aurora --api-url http://<maestra-host>:8080

Running as a systemd service on Raspberry Pi:
  sudo cp examples/potentiometer_4x.service /etc/systemd/system/
  # Edit the service file to set your --entity-slug and --api-url
  sudo systemctl daemon-reload
  sudo systemctl enable potentiometer_4x
  sudo systemctl start potentiometer_4x
  sudo journalctl -u potentiometer_4x -f   # view logs
"""

import asyncio
import argparse
import glob
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
# 0.01 ~ 10 ADC counts out of 1023, enough to ignore analog noise/drift.
DEADBAND = 0.01

SERIAL_GLOBS = ["/dev/ttyUSB*", "/dev/ttyACM*"]
RETRY_INITIAL = 2
RETRY_MAX = 30


def find_serial_port(preferred: str | None) -> str | None:
    """Return an available serial port, or None if nothing is found.

    Tries the preferred port first (if given), then scans common USB-serial
    device paths.
    """
    if preferred:
        if os.path.exists(preferred):
            return preferred

    for pattern in SERIAL_GLOBS:
        matches = sorted(glob.glob(pattern))
        if matches:
            return matches[0]

    return None


async def open_serial(preferred_port: str | None, baud_rate: int) -> serial.Serial:
    """Keep scanning for a serial device until one is found and opened."""
    backoff = RETRY_INITIAL
    while True:
        port = find_serial_port(preferred_port)
        if port:
            try:
                ser = serial.Serial(port, baud_rate, timeout=1)
                print(f"Opened serial port {port} @ {baud_rate} baud")
                return ser
            except (serial.SerialException, OSError) as exc:
                print(f"Failed to open {port}: {exc}")

        print(f"No Arduino found, retrying in {backoff}s...")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, RETRY_MAX)


async def connect_maestra(api_url: str, entity_slug: str):
    """Connect to Maestra and resolve the target entity, retrying on failure."""
    backoff = RETRY_INITIAL
    while True:
        try:
            client = MaestraClient(
                ConnectionConfig(api_url=api_url, nats_url=None, mqtt_broker=None)
            )
            await client.connect()
            entity = await client.get_entity_by_slug(entity_slug)
            print(f"Connected to Maestra - entity: {entity.name} ({entity.slug})")
            return client, entity
        except Exception as exc:
            print(f"Maestra connection failed: {exc}, retrying in {backoff}s...")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, RETRY_MAX)


async def main(
    serial_port: str | None,
    baud_rate: int,
    entity_slug: str,
    api_url: str,
    interval: float,
    deadband: float,
):
    print(f"Deadband threshold: {deadband}")

    while True:
        # --- Establish connections ---
        ser = await open_serial(serial_port, baud_rate)
        client, entity = await connect_maestra(api_url, entity_slug)

        last_values: list[float | None] = [None] * NUM_POTS

        # --- Read loop ---
        try:
            while True:
                try:
                    raw = ser.readline().decode("utf-8", errors="ignore").strip()
                except (serial.SerialException, OSError) as exc:
                    print(f"Serial read error: {exc} - will reconnect...")
                    break

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

                changed = {}
                for i, raw_value in enumerate(raw_values):
                    normalized = round(raw_value / 1023.0, 4)
                    if last_values[i] is None or abs(normalized - last_values[i]) >= deadband:
                        changed[POT_KEYS[i]] = normalized
                        last_values[i] = normalized

                if changed:
                    try:
                        await entity.state.update(changed, source="potentiometer")
                        labels = ", ".join(
                            f"{POT_LABELS[POT_KEYS.index(k)]}={v}" for k, v in changed.items()
                        )
                        print(f"updated: {labels}")
                    except Exception as exc:
                        print(f"API error (will retry next cycle): {exc}")

                await asyncio.sleep(interval)

        except KeyboardInterrupt:
            print("\nStopping...")
            ser.close()
            await client.disconnect()
            return
        finally:
            try:
                ser.close()
            except Exception:
                pass
            try:
                await client.disconnect()
            except Exception:
                pass

        print("Reconnecting...")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Read 4 potentiometers via Arduino serial and publish to Maestra"
    )
    parser.add_argument(
        "--port", default=None,
        help="Serial port (default: auto-detect /dev/ttyUSB* or /dev/ttyACM*)",
    )
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default: 9600)")
    parser.add_argument("--entity-slug", required=True, help="Slug of the Maestra entity to update")
    parser.add_argument("--api-url", default="http://localhost:8080", help="Maestra API URL")
    parser.add_argument("--interval", type=float, default=0.05, help="Read interval in seconds (default: 0.05)")
    parser.add_argument(
        "--deadband", type=float, default=DEADBAND,
        help=f"Minimum normalized change to trigger an update (default: {DEADBAND})",
    )
    args = parser.parse_args()

    try:
        asyncio.run(main(args.port, args.baud, args.entity_slug, args.api_url, args.interval, args.deadband))
    except KeyboardInterrupt:
        pass
