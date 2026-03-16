"""
Maestra Discovery - mDNS/DNS-SD helpers for automatic service discovery

Requires the 'zeroconf' package: pip install maestra[discovery]
"""

import asyncio
import socket
import logging
from typing import Optional

from .types import ConnectionConfig

log = logging.getLogger("maestra.discovery")

# Service types
SERVER_SERVICE_TYPE = "_maestra._tcp.local."
DEVICE_SERVICE_TYPE = "_maestra-device._tcp.local."


async def discover_maestra(timeout: float = 5.0) -> ConnectionConfig:
    """
    Discover a Maestra server on the local network via mDNS.

    Browses for _maestra._tcp.local. and extracts connection details
    from the TXT records.

    Args:
        timeout: How long to wait for discovery (seconds)

    Returns:
        ConnectionConfig populated with discovered server details

    Raises:
        ImportError: If zeroconf is not installed
        TimeoutError: If no Maestra server found within timeout
    """
    try:
        from zeroconf import Zeroconf, ServiceBrowser, ServiceInfo
    except ImportError:
        raise ImportError(
            "zeroconf is required for discovery. "
            "Install it with: pip install maestra[discovery]"
        )

    found_config = None
    event = asyncio.Event()

    class Listener:
        def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
            nonlocal found_config
            info = ServiceInfo(type_, name)
            if info.request(zc, 3000):
                props = {}
                if info.properties:
                    for k, v in info.properties.items():
                        key = k.decode("utf-8") if isinstance(k, bytes) else k
                        val = v.decode("utf-8") if isinstance(v, bytes) else str(v)
                        props[key] = val

                found_config = ConnectionConfig(
                    api_url=props.get("api_url", f"http://{_get_ip(info)}:8080"),
                    nats_url=props.get("nats_url", f"nats://{_get_ip(info)}:4222"),
                    mqtt_broker=props.get("mqtt_broker", _get_ip(info)),
                    mqtt_port=int(props.get("mqtt_port", "1883")),
                )
                log.info(f"Discovered Maestra at {found_config.api_url}")
                event.set()

        def remove_service(self, zc, type_, name):
            pass

        def update_service(self, zc, type_, name):
            pass

    zc = Zeroconf()
    try:
        browser = ServiceBrowser(zc, SERVER_SERVICE_TYPE, Listener())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"No Maestra server found within {timeout}s. "
                "Ensure the discovery service is running."
            )
        return found_config
    finally:
        zc.close()


async def advertise_device(
    hardware_id: str,
    device_type: str,
    name: str,
    port: int = 0,
    firmware_version: Optional[str] = None,
):
    """
    Advertise this device on the network as _maestra-device._tcp.local.
    The Maestra discovery service will detect this and register it as pending.

    Args:
        hardware_id: Unique device identifier (MAC address, serial, etc.)
        device_type: Device type (e.g., 'esp32', 'raspberry_pi')
        name: Human-readable device name
        port: Service port (0 if not applicable)
        firmware_version: Optional firmware version string

    Returns:
        A tuple of (Zeroconf, ServiceInfo) — call zc.unregister_service(info)
        and zc.close() when done.
    """
    try:
        from zeroconf import Zeroconf, ServiceInfo
    except ImportError:
        raise ImportError(
            "zeroconf is required for discovery. "
            "Install it with: pip install maestra[discovery]"
        )

    properties = {
        "hardware_id": hardware_id,
        "device_type": device_type,
        "name": name,
    }
    if firmware_version:
        properties["firmware_version"] = firmware_version

    # Get local IP
    local_ip = _get_local_ip()
    ip_bytes = socket.inet_aton(local_ip)

    service_name = f"{name.replace(' ', '-')}.{DEVICE_SERVICE_TYPE}"
    info = ServiceInfo(
        DEVICE_SERVICE_TYPE,
        service_name,
        addresses=[ip_bytes],
        port=port,
        properties=properties,
        server=f"{name.replace(' ', '-')}.local.",
    )

    zc = Zeroconf()
    zc.register_service(info)
    log.info(f"Advertising device '{name}' ({hardware_id}) as {DEVICE_SERVICE_TYPE}")

    return zc, info


async def wait_for_provisioning(
    api_url: str,
    device_id: str,
    poll_interval: float = 5.0,
    timeout: float = 300.0,
) -> dict:
    """
    Poll the Fleet Manager for provisioning config until the device is approved.

    Args:
        api_url: Fleet Manager API URL
        device_id: Device UUID from registration
        poll_interval: Seconds between polling attempts
        timeout: Maximum time to wait (seconds)

    Returns:
        Provisioning config dict with connection details and env vars

    Raises:
        TimeoutError: If not approved within timeout
    """
    import aiohttp

    url = f"{api_url.rstrip('/')}/devices/{device_id}/provision"
    elapsed = 0.0

    async with aiohttp.ClientSession() as session:
        while elapsed < timeout:
            try:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        log.info(f"Device provisioned: {data.get('provision_status')}")
                        return data
                    elif response.status == 403:
                        # Not approved yet
                        log.debug("Device not yet approved, waiting...")
                    else:
                        log.warning(f"Provision check returned {response.status}")
            except Exception as e:
                log.debug(f"Provision check failed: {e}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

    raise TimeoutError(f"Device not provisioned within {timeout}s")


def _get_ip(info) -> str:
    """Extract IP address from ServiceInfo"""
    if info.addresses:
        return socket.inet_ntoa(info.addresses[0])
    return "localhost"


def _get_local_ip() -> str:
    """Get the local IP address of this machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
