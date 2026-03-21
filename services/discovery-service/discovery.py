"""
Maestra Discovery Service
Advertises Maestra server via mDNS/DNS-SD and listens for device advertisements.

Uses zeroconf to:
1. Register _maestra._tcp.local. so devices can find the server
2. Browse _maestra-device._tcp.local. to detect new devices on the network
3. Report discovered devices to Fleet Manager for approval
"""

import asyncio
import json
import os
import signal
import socket
import logging
from datetime import datetime

import httpx
from zeroconf import Zeroconf, ServiceBrowser, ServiceInfo, ServiceStateChange
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser, AsyncServiceInfo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("maestra-discovery")

# Configuration
FLEET_MANAGER_URL = os.getenv("FLEET_MANAGER_URL", "http://localhost:8080")
HOST_IP = os.getenv("HOST_IP", "10.0.0.199")
NATS_URL = os.getenv("NATS_URL", f"nats://{HOST_IP}:4222")
MQTT_BROKER = os.getenv("MQTT_BROKER", HOST_IP)
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
WS_URL = os.getenv("WS_URL", f"ws://{HOST_IP}:8765")
API_URL = os.getenv("API_URL", f"http://{HOST_IP}:8080")
SERVICE_VERSION = os.getenv("MAESTRA_VERSION", "0.2.0")

# mDNS service types
SERVER_SERVICE_TYPE = "_maestra._tcp.local."
DEVICE_SERVICE_TYPE = "_maestra-device._tcp.local."

# Track known devices to avoid re-reporting
known_devices: set[str] = set()
blocked_devices: set[str] = set()


class DeviceListener:
    """Handles mDNS service discovery events for Maestra devices"""

    def __init__(self, http_client: httpx.AsyncClient, loop: asyncio.AbstractEventLoop):
        self.http_client = http_client
        self.loop = loop

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a service is updated"""
        pass

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a service is removed"""
        log.info(f"Device service removed: {name}")
        # Remove from known set so it can be re-discovered
        known_devices.discard(name)

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        """Called when a new device service is discovered"""
        if name in known_devices:
            return

        log.info(f"New device service discovered: {name}")
        asyncio.run_coroutine_threadsafe(
            self._handle_new_device(zc, type_, name),
            self.loop,
        )

    async def _handle_new_device(self, zc: Zeroconf, type_: str, name: str):
        """Process a newly discovered device"""
        try:
            info = ServiceInfo(type_, name)
            if not info.request(zc, 3000):
                log.warning(f"Could not resolve service info for {name}")
                return

            # Extract TXT record properties
            properties = {}
            if info.properties:
                for key, value in info.properties.items():
                    k = key.decode("utf-8") if isinstance(key, bytes) else key
                    v = value.decode("utf-8") if isinstance(value, bytes) else str(value)
                    properties[k] = v

            hardware_id = properties.get("hardware_id", "")
            if not hardware_id:
                log.warning(f"Device {name} has no hardware_id in TXT records, skipping")
                return

            if hardware_id in blocked_devices:
                log.info(f"Skipping blocked device: {hardware_id}")
                return

            # Get device IP
            ip_address = None
            if info.addresses:
                ip_address = socket.inet_ntoa(info.addresses[0])

            device_data = {
                "name": properties.get("name", name.split(".")[0]),
                "device_type": properties.get("device_type", "unknown"),
                "hardware_id": hardware_id,
                "firmware_version": properties.get("firmware_version"),
                "ip_address": ip_address,
                "metadata": {
                    "mdns_name": name,
                    "discovered_via": "zeroconf",
                    "discovered_at": datetime.utcnow().isoformat() + "Z",
                    **{k: v for k, v in properties.items()
                       if k not in ("hardware_id", "name", "device_type", "firmware_version")},
                },
            }

            log.info(f"Reporting device to Fleet Manager: {hardware_id} ({device_data['name']})")
            response = await self.http_client.post(
                f"{FLEET_MANAGER_URL}/devices/discover",
                json=device_data,
                timeout=10.0,
            )

            if response.status_code == 200:
                known_devices.add(name)
                log.info(f"Device registered as pending: {hardware_id}")
            elif response.status_code == 403:
                blocked_devices.add(hardware_id)
                known_devices.add(name)
                log.info(f"Device is blocked: {hardware_id}")
            elif response.status_code == 409:
                known_devices.add(name)
                log.info(f"Device already registered: {hardware_id}")
            else:
                log.error(f"Fleet Manager returned {response.status_code}: {response.text}")

        except Exception as e:
            log.error(f"Error handling discovered device {name}: {e}")


def build_server_service_info() -> ServiceInfo:
    """Build the mDNS service info for the Maestra server"""
    # Resolve host IP to bytes
    try:
        ip_bytes = socket.inet_aton(HOST_IP)
    except socket.error:
        log.warning(f"Invalid HOST_IP '{HOST_IP}', falling back to 0.0.0.0")
        ip_bytes = socket.inet_aton("0.0.0.0")

    properties = {
        "api_url": API_URL,
        "nats_url": NATS_URL,
        "mqtt_broker": MQTT_BROKER,
        "mqtt_port": str(MQTT_PORT),
        "ws_url": WS_URL,
        "version": SERVICE_VERSION,
    }

    return ServiceInfo(
        SERVER_SERVICE_TYPE,
        f"Maestra.{SERVER_SERVICE_TYPE}",
        addresses=[ip_bytes],
        port=8080,
        properties=properties,
        server=f"maestra-server.local.",
    )


async def refresh_blocked_list(http_client: httpx.AsyncClient):
    """Periodically refresh the blocked devices list from Fleet Manager"""
    while True:
        try:
            response = await http_client.get(
                f"{FLEET_MANAGER_URL}/devices/blocked",
                timeout=10.0,
            )
            if response.status_code == 200:
                data = response.json()
                blocked_devices.clear()
                blocked_devices.update(d["hardware_id"] for d in data)
                log.debug(f"Refreshed blocked list: {len(blocked_devices)} entries")
        except Exception as e:
            log.debug(f"Could not refresh blocked list: {e}")

        await asyncio.sleep(60)  # Refresh every minute


async def main():
    """Main entry point"""
    log.info("=" * 60)
    log.info("Maestra Discovery Service starting")
    log.info(f"  Fleet Manager: {FLEET_MANAGER_URL}")
    log.info(f"  Host IP: {HOST_IP}")
    log.info(f"  Server service: {SERVER_SERVICE_TYPE}")
    log.info(f"  Device service: {DEVICE_SERVICE_TYPE}")
    log.info("=" * 60)

    # Wait for Fleet Manager to be available
    http_client = httpx.AsyncClient()
    for attempt in range(30):
        try:
            r = await http_client.get(f"{FLEET_MANAGER_URL}/health", timeout=5.0)
            if r.status_code == 200:
                log.info("Fleet Manager is healthy")
                break
        except Exception:
            pass
        log.info(f"Waiting for Fleet Manager... (attempt {attempt + 1}/30)")
        await asyncio.sleep(2)
    else:
        log.error("Fleet Manager not available after 60 seconds, exiting")
        return

    loop = asyncio.get_running_loop()

    # Initialize zeroconf
    zc = Zeroconf()

    # Register the Maestra server service
    server_info = build_server_service_info()
    log.info(f"Registering mDNS service: {SERVER_SERVICE_TYPE}")
    await zc.async_register_service(server_info)
    log.info(f"Maestra server advertised at {HOST_IP}:8080")

    # Browse for device services
    listener = DeviceListener(http_client, loop)
    browser = ServiceBrowser(zc, DEVICE_SERVICE_TYPE, listener)
    log.info(f"Listening for device advertisements on {DEVICE_SERVICE_TYPE}")

    # Start blocked list refresh task
    refresh_task = asyncio.create_task(refresh_blocked_list(http_client))

    # Wait for shutdown signal
    shutdown_event = asyncio.Event()

    def signal_handler():
        log.info("Shutdown signal received")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await shutdown_event.wait()
    finally:
        log.info("Shutting down...")
        refresh_task.cancel()
        browser.cancel()
        await zc.async_unregister_service(server_info)
        await zc.async_close()
        await http_client.aclose()
        log.info("Discovery service stopped")


if __name__ == "__main__":
    asyncio.run(main())
