"""
RTL-SDR Spectrum Analyzer → Maestra (Raspberry Pi)

Reads IQ samples from an RTL-SDR USB dongle, computes FFT power spectrum,
and sends data to Maestra at two different rates:

  - Entity state (slow, ~1 Hz):  tuner config, signal summary, device health
  - Spectrum stream (fast, configurable):  full FFT magnitude array via UDP
  - Metrics (periodic, ~0.1 Hz):  SNR, noise floor, peak power for time-series DB
  - Events (on change):  frequency changes, strong signal detections, errors

Hardware:
  RTL-SDR dongle (RTL2832U) plugged into any USB port on the Raspberry Pi.

Usage:
  pip install -r requirements.txt
  python rtl_sdr_maestra.py --entity-slug my-sdr --api-url http://<maestra-host>:8080

  # With spectrum streaming (requires a UDP listener on the consumer side):
  python rtl_sdr_maestra.py --entity-slug my-sdr --stream --stream-port 9900

  # Custom tuning:
  python rtl_sdr_maestra.py --entity-slug my-sdr --frequency 433.92e6 --gain 30
"""

import asyncio
import argparse
import json
import math
import os
import platform
import signal
import socket
import struct
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import numpy as np
from rtlsdr import RtlSdr

# Allow importing the SDK from the repo when not installed as a package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdks", "python"))

from maestra import (
    MaestraClient,
    ConnectionConfig,
    StreamPublisher,
    StreamAdvertiseParams,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_local_ip() -> str:
    """Best-effort guess at the Pi's LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def read_cpu_temp() -> Optional[float]:
    """Read Raspberry Pi CPU temperature (Linux thermal zone)."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return round(int(f.read().strip()) / 1000.0, 1)
    except Exception:
        return None


def compute_spectrum(iq_samples: np.ndarray, fft_size: int) -> np.ndarray:
    """Compute power spectral density in dB from raw IQ samples."""
    # Use a Hann window to reduce spectral leakage
    window = np.hanning(fft_size)
    windowed = iq_samples[:fft_size] * window

    # FFT and shift DC to center
    spectrum = np.fft.fftshift(np.fft.fft(windowed))

    # Power in dB (relative to full scale)
    magnitude = np.abs(spectrum)
    magnitude[magnitude == 0] = 1e-12  # avoid log(0)
    power_db = 20.0 * np.log10(magnitude / fft_size)

    return power_db


def spectrum_summary(power_db: np.ndarray, center_freq: float, sample_rate: float):
    """Extract summary statistics from a spectrum sweep."""
    noise_floor = float(np.median(power_db))
    peak_idx = int(np.argmax(power_db))
    peak_power = float(power_db[peak_idx])

    # Convert bin index to frequency
    fft_size = len(power_db)
    freq_resolution = sample_rate / fft_size
    peak_freq = center_freq - (sample_rate / 2) + peak_idx * freq_resolution

    snr = peak_power - noise_floor
    return {
        "noise_floor_db": round(noise_floor, 2),
        "peak_power_db": round(peak_power, 2),
        "peak_frequency_hz": round(peak_freq, 0),
        "snr_db": round(snr, 2),
    }


def pack_spectrum_packet(
    center_freq: float,
    sample_rate: float,
    power_db: np.ndarray,
    seq: int,
) -> bytes:
    """Pack spectrum data into a compact binary UDP packet.

    Packet layout (little-endian):
      [0:4]   uint32  magic       0x53445246 ("SDRF")
      [4:8]   uint32  sequence    monotonic counter
      [8:16]  float64 center_freq Hz
      [16:24] float64 sample_rate Hz
      [24:28] uint32  fft_size    number of bins
      [28:32] uint32  reserved    (zero)
      [32:]   float32[] power_db  one float per bin
    """
    fft_size = len(power_db)
    header = struct.pack(
        "<IIdddI",
        0x53445246,  # magic
        seq,
        center_freq,
        sample_rate,
        0.0,  # reserved
        fft_size,
    )
    body = power_db.astype(np.float32).tobytes()
    return header + body


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

MAX_RETRIES = 3

async def _http_post(session: aiohttp.ClientSession, url: str, json: dict, retries: int = MAX_RETRIES):
    """POST with automatic retry on transient connection errors (stale keep-alive, etc.)."""
    for attempt in range(retries):
        try:
            async with session.post(url, json=json) as resp:
                return resp.status, await resp.text()
        except (aiohttp.ServerDisconnectedError, aiohttp.ClientOSError) as e:
            if attempt < retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
            else:
                raise


# ---------------------------------------------------------------------------
# Device registration / heartbeat helpers (direct HTTP — not yet in SDK)
# ---------------------------------------------------------------------------

async def register_device(session: aiohttp.ClientSession, api_url: str, hardware_id: str):
    """Register the RTL-SDR device with Maestra and return the device record."""
    body = {
        "name": f"RTL-SDR ({hardware_id})",
        "device_type": "sensor",
        "hardware_id": hardware_id,
        "firmware_version": "rtlsdr-python",
        "ip_address": get_local_ip(),
        "location": {},
        "metadata": {
            "platform": platform.machine(),
            "os": platform.system(),
            "hostname": platform.node(),
        },
    }
    async with session.post(f"{api_url}/devices/register", json=body) as resp:
        if resp.status == 409:
            # Already registered — fetch existing device by hardware_id
            async with session.get(f"{api_url}/devices") as list_resp:
                devices = await list_resp.json()
                for d in devices:
                    if d.get("hardware_id") == hardware_id:
                        print(f"Device already registered (id={d['id']}), reusing.")
                        return d
            raise RuntimeError("Device 409 conflict but could not find existing device")
        if resp.status >= 400:
            text = await resp.text()
            raise RuntimeError(f"Device registration failed ({resp.status}): {text}")
        return await resp.json()


async def send_heartbeat(session: aiohttp.ClientSession, api_url: str, hardware_id: str):
    """Send a device heartbeat to keep the device online."""
    body = {
        "hardware_id": hardware_id,
        "status": "online",
        "metadata": {
            "cpu_temp_c": read_cpu_temp(),
            "uptime_s": int(time.monotonic()),
        },
    }
    status, text = await _http_post(session, f"{api_url}/devices/heartbeat", body)
    if status >= 400:
        print(f"Heartbeat failed ({status}): {text}")


async def submit_metrics(
    session: aiohttp.ClientSession,
    api_url: str,
    device_id: str,
    summary: dict,
):
    """Submit spectrum summary metrics to TimescaleDB via the Fleet Manager."""
    metrics = [
        {"device_id": device_id, "metric_name": "noise_floor", "metric_value": summary["noise_floor_db"], "unit": "dBFS", "tags": {}},
        {"device_id": device_id, "metric_name": "peak_power", "metric_value": summary["peak_power_db"], "unit": "dBFS", "tags": {}},
        {"device_id": device_id, "metric_name": "snr", "metric_value": summary["snr_db"], "unit": "dB", "tags": {}},
    ]
    cpu_temp = read_cpu_temp()
    if cpu_temp is not None:
        metrics.append({"device_id": device_id, "metric_name": "cpu_temperature", "metric_value": cpu_temp, "unit": "celsius", "tags": {}})

    status, text = await _http_post(session, f"{api_url}/metrics/batch", metrics)
    if status >= 400:
        print(f"Metrics submission failed ({status}): {text}")


async def submit_event(
    session: aiohttp.ClientSession,
    api_url: str,
    device_id: str,
    event_type: str,
    severity: str,
    message: str,
    data: dict,
):
    """Submit a discrete event."""
    body = {
        "device_id": device_id,
        "event_type": event_type,
        "severity": severity,
        "message": message,
        "data": data,
    }
    status, text = await _http_post(session, f"{api_url}/events", body)
    if status >= 400:
        print(f"Event submission failed ({status}): {text}")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def main(args):
    # ── SDR setup ──────────────────────────────────────────────────────────
    sdr = RtlSdr()
    sdr.sample_rate = args.sample_rate
    sdr.center_freq = args.frequency
    sdr.gain = args.gain if args.gain > 0 else "auto"

    hardware_id = f"rtlsdr-{sdr.get_tuner_type()}-{id(sdr) & 0xFFFF:04x}"

    print(f"RTL-SDR initialized:")
    print(f"  Center freq : {sdr.center_freq / 1e6:.3f} MHz")
    print(f"  Sample rate : {sdr.sample_rate / 1e6:.2f} MS/s")
    print(f"  Gain        : {sdr.gain}")
    print(f"  FFT size    : {args.fft_size}")
    print(f"  Hardware ID : {hardware_id}")

    # ── Maestra connections ────────────────────────────────────────────────
    client = MaestraClient(ConnectionConfig(
        api_url=args.api_url,
        nats_url=args.nats_url,
        mqtt_broker=None,
    ))
    await client.connect()

    entity = await client.get_entity_by_slug(args.entity_slug)
    print(f"Publishing to entity: {entity.name} ({entity.slug})")

    # HTTP session for direct API calls (device reg, metrics, events)
    http_session = aiohttp.ClientSession()

    # Register device
    device = await register_device(http_session, args.api_url, hardware_id)
    device_id = device["id"]
    print(f"Device registered: {device_id}")

    # ── Set initial entity state ───────────────────────────────────────────
    await entity.state.replace({
        "status": "running",
        "center_frequency_hz": sdr.center_freq,
        "center_frequency_mhz": round(sdr.center_freq / 1e6, 3),
        "sample_rate_hz": sdr.sample_rate,
        "gain": sdr.gain if isinstance(sdr.gain, (int, float)) else 0,
        "gain_mode": "manual" if args.gain > 0 else "auto",
        "fft_size": args.fft_size,
        "noise_floor_db": None,
        "peak_power_db": None,
        "peak_frequency_hz": None,
        "snr_db": None,
        "device_id": device_id,
        "hardware_id": hardware_id,
        "ip_address": get_local_ip(),
        "cpu_temp_c": read_cpu_temp(),
        "streaming": args.stream,
    }, source="rtl-sdr")

    # ── Optional: advertise spectrum stream ────────────────────────────────
    publisher: Optional[StreamPublisher] = None
    udp_sock: Optional[socket.socket] = None

    if args.stream:
        local_ip = get_local_ip()
        publisher = StreamPublisher(
            client,
            StreamAdvertiseParams(
                name=f"RTL-SDR Spectrum ({hardware_id})",
                stream_type="sensor",
                publisher_id=hardware_id,
                protocol="udp",
                address=local_ip,
                port=args.stream_port,
                device_id=device_id,
                config={
                    "format": "sdrf_binary",
                    "fft_size": args.fft_size,
                    "center_frequency_hz": sdr.center_freq,
                    "sample_rate_hz": sdr.sample_rate,
                },
                metadata={
                    "description": "Real-time FFT power spectrum from RTL-SDR",
                    "data_unit": "dBFS",
                },
            ),
        )
        stream = await publisher.start()
        print(f"Spectrum stream advertised: {stream.id} on udp://{local_ip}:{args.stream_port}")

        # Create a UDP socket for sending spectrum packets
        udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

        # ── NATS-based consumer auto-registration ─────────────────────────
        # When devices (e.g. ESP32 dashboard) discover this stream via MQTT,
        # they publish a consumer registration message.  The MQTT-NATS bridge
        # routes it to NATS so we can pick it up here automatically.
        if client._nats:
            subscribe_subject = f"maestra.mqtt.maestra.stream.{stream.id}.subscribe"
            unsubscribe_subject = f"maestra.mqtt.maestra.stream.{stream.id}.unsubscribe"

            async def on_consumer_subscribe(msg):
                try:
                    envelope = json.loads(msg.data.decode())
                    # The bridge wraps the payload in an envelope
                    payload = envelope.get("data", envelope)
                    addr = payload.get("address")
                    port = payload.get("port")
                    if addr and port:
                        dest = (addr, int(port))
                        if dest not in consumers:
                            consumers.append(dest)
                            print(f"  >> Consumer registered: {addr}:{port}")
                except Exception as e:
                    print(f"  Consumer registration parse error: {e}")

            async def on_consumer_unsubscribe(msg):
                try:
                    envelope = json.loads(msg.data.decode())
                    payload = envelope.get("data", envelope)
                    addr = payload.get("address")
                    port = payload.get("port")
                    if addr and port:
                        dest = (addr, int(port))
                        if dest in consumers:
                            consumers.remove(dest)
                            print(f"  << Consumer unregistered: {addr}:{port}")
                except Exception as e:
                    print(f"  Consumer unregistration parse error: {e}")

            await client._nats.subscribe(subscribe_subject, cb=on_consumer_subscribe)
            await client._nats.subscribe(unsubscribe_subject, cb=on_consumer_unsubscribe)
            print(f"Listening for consumer registrations via NATS bridge")
        else:
            print("Note: NATS not connected — use --nats-url for auto consumer discovery, or --stream-dest for manual")

    # ── Graceful shutdown ──────────────────────────────────────────────────
    shutdown = asyncio.Event()

    def _signal_handler():
        print("\nShutdown requested...")
        shutdown.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    # ── Run ────────────────────────────────────────────────────────────────
    seq = 0
    metrics_interval = 10.0  # seconds between metric submissions
    heartbeat_interval = 15.0  # seconds between heartbeats
    state_interval = 30.0  # seconds between entity state updates
    last_metrics_time = 0.0
    last_heartbeat_time = 0.0
    last_state_time = 0.0
    prev_summary = {}
    consumers: list[tuple[str, int]] = []  # (host, port) of spectrum consumers

    # If streaming, we listen for consumers that connect via Maestra sessions.
    # For simplicity, we also accept a direct --stream-dest flag.
    if args.stream_dest:
        host, port = args.stream_dest.split(":")
        consumers.append((host, int(port)))
        print(f"Streaming spectrum to {host}:{port}")

    print("\nRunning... (Ctrl+C to stop)\n")

    try:
        while not shutdown.is_set():
            now = time.monotonic()

            # Read IQ samples from the SDR
            iq_samples = sdr.read_samples(args.fft_size)

            # Compute FFT spectrum
            power_db = compute_spectrum(iq_samples, args.fft_size)
            summary = spectrum_summary(power_db, sdr.center_freq, sdr.sample_rate)
            seq += 1

            # ── Stream spectrum via UDP ────────────────────────────────────
            if udp_sock and consumers:
                packet = pack_spectrum_packet(
                    sdr.center_freq, sdr.sample_rate, power_db, seq,
                )
                for dest in consumers:
                    try:
                        udp_sock.sendto(packet, dest)
                    except OSError as e:
                        print(f"UDP send error to {dest}: {e}")

            # ── Update entity state (~1 Hz) ────────────────────────────────
            if now - last_state_time >= state_interval:
                state_update = {
                    "noise_floor_db": summary["noise_floor_db"],
                    "peak_power_db": summary["peak_power_db"],
                    "peak_frequency_hz": summary["peak_frequency_hz"],
                    "snr_db": summary["snr_db"],
                    "cpu_temp_c": read_cpu_temp(),
                }
                await entity.state.update(state_update, source="rtl-sdr")
                last_state_time = now

                if seq % 50 == 0:
                    print(
                        f"[{seq:>6}] "
                        f"noise={summary['noise_floor_db']:+.1f} dB  "
                        f"peak={summary['peak_power_db']:+.1f} dB @ "
                        f"{summary['peak_frequency_hz']/1e6:.4f} MHz  "
                        f"SNR={summary['snr_db']:.1f} dB"
                    )

            # ── Submit metrics (~every 10s) ────────────────────────────────
            if now - last_metrics_time >= metrics_interval:
                await submit_metrics(http_session, args.api_url, device_id, summary)
                last_metrics_time = now

            # ── Device heartbeat (~every 15s) ──────────────────────────────
            if now - last_heartbeat_time >= heartbeat_interval:
                await send_heartbeat(http_session, args.api_url, hardware_id)
                last_heartbeat_time = now

            # ── Detect strong signals (event) ──────────────────────────────
            if (
                args.signal_threshold is not None
                and summary["snr_db"] >= args.signal_threshold
                and prev_summary.get("snr_db", 0) < args.signal_threshold
            ):
                await submit_event(
                    http_session, args.api_url, device_id,
                    event_type="strong_signal_detected",
                    severity="info",
                    message=f"Strong signal detected at {summary['peak_frequency_hz']/1e6:.4f} MHz",
                    data=summary,
                )
                print(f"  ** Strong signal detected: {summary['peak_frequency_hz']/1e6:.4f} MHz ({summary['snr_db']:.1f} dB SNR)")

            prev_summary = summary

            # Small yield to keep the event loop responsive
            await asyncio.sleep(args.interval)

    finally:
        print("Shutting down...")

        # Update entity state to stopped
        await entity.state.update({"status": "stopped"}, source="rtl-sdr")

        # Withdraw stream
        if publisher:
            await publisher.stop()
            print("Spectrum stream withdrawn")

        if udp_sock:
            udp_sock.close()

        # Close SDR
        sdr.close()

        # Send offline heartbeat
        await send_heartbeat(http_session, args.api_url, hardware_id)

        await http_session.close()
        await client.disconnect()
        print("Done.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="RTL-SDR spectrum analyzer with Maestra integration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
examples:
  # Basic usage — entity state + metrics only
  python rtl_sdr_maestra.py --entity-slug my-sdr

  # Tune to 433 MHz ISM band, higher gain
  python rtl_sdr_maestra.py --entity-slug my-sdr -f 433.92e6 -g 40

  # Enable spectrum streaming to a specific consumer
  python rtl_sdr_maestra.py --entity-slug my-sdr --stream --stream-dest 192.168.1.50:9900

  # FM broadcast band scan with signal detection
  python rtl_sdr_maestra.py --entity-slug my-sdr -f 100e6 --signal-threshold 20
""",
    )

    # Maestra connection
    parser.add_argument("--entity-slug", required=True, help="Slug of the Maestra entity to update")
    parser.add_argument("--api-url", default="http://localhost:8080", help="Maestra Fleet Manager API URL")
    parser.add_argument("--nats-url", default=None, help="NATS URL for real-time subscriptions (optional)")

    # SDR configuration
    parser.add_argument("-f", "--frequency", type=float, default=100e6, help="Center frequency in Hz (default: 100 MHz)")
    parser.add_argument("-s", "--sample-rate", type=float, default=2.048e6, help="Sample rate in Hz (default: 2.048 MS/s)")
    parser.add_argument("-g", "--gain", type=float, default=0, help="Tuner gain in dB (0 = auto, default: auto)")
    parser.add_argument("--fft-size", type=int, default=1024, help="FFT size / number of bins (default: 1024)")

    # Timing
    parser.add_argument("--interval", type=float, default=0.05, help="Minimum seconds between FFT cycles (default: 0.05)")

    # Streaming
    parser.add_argument("--stream", action="store_true", help="Advertise a Maestra spectrum stream")
    parser.add_argument("--stream-port", type=int, default=9900, help="UDP port to advertise for spectrum stream (default: 9900)")
    parser.add_argument("--stream-dest", default=None, help="Direct UDP destination host:port for spectrum data")

    # Detection
    parser.add_argument("--signal-threshold", type=float, default=None, help="SNR threshold in dB to emit a strong_signal_detected event")

    args = parser.parse_args()

    # Validate FFT size is a power of 2
    if args.fft_size & (args.fft_size - 1) != 0 or args.fft_size < 64:
        parser.error("--fft-size must be a power of 2 and >= 64")

    asyncio.run(main(args))
