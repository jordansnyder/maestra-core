"""
Maestra Discovery - mDNS/DNS-SD helpers for TouchDesigner

Provides automatic discovery of Maestra servers on the local network,
device advertisement to the Fleet Manager, and provisioning polling.

Requires the 'zeroconf' package: pip install zeroconf

Usage in TouchDesigner:
    from MaestraDiscovery import discover_maestra, advertise_device, wait_for_provisioning

    # 1. Find Maestra on the network
    config = discover_maestra(timeout=5.0)
    print(config)  # {'api_url': ..., 'nats_url': ..., ...}

    # 2. Register this device
    device = advertise_device(config['api_url'], hardware_id='TD-001', device_type='touchdesigner')

    # 3. Wait for admin approval (blocking — run from a Script CHOP or thread)
    provision = wait_for_provisioning(config['api_url'], device['id'])
"""

import json
import socket
import threading
import urllib.request
import urllib.error


# mDNS service type for Maestra servers
SERVICE_TYPE = "_maestra._tcp.local."


def discover_maestra(timeout=5.0):
    """
    Discover a Maestra server on the local network via mDNS.

    Browses for _maestra._tcp.local. and extracts connection details
    from the TXT records.

    Args:
        timeout: How long to wait for discovery (seconds)

    Returns:
        dict with keys: api_url, nats_url, mqtt_broker, mqtt_port, ws_url

    Raises:
        ImportError: If zeroconf is not installed
        TimeoutError: If no Maestra server found within timeout
    """
    try:
        from zeroconf import Zeroconf, ServiceBrowser, ServiceInfo
    except ImportError:
        raise ImportError(
            "zeroconf is required for Maestra discovery. "
            "Install it with: pip install zeroconf"
        )

    found_config = {}
    event = threading.Event()

    class Listener:
        def add_service(self, zc, type_, name):
            info = ServiceInfo(type_, name)
            if info.request(zc, 3000):
                props = {}
                if info.properties:
                    for k, v in info.properties.items():
                        key = k.decode("utf-8") if isinstance(k, bytes) else k
                        val = v.decode("utf-8") if isinstance(v, bytes) else str(v)
                        props[key] = val

                ip = _get_ip(info)
                found_config["api_url"] = props.get("api_url", f"http://{ip}:8080")
                found_config["nats_url"] = props.get("nats_url", f"nats://{ip}:4222")
                found_config["mqtt_broker"] = props.get("mqtt_broker", ip)
                found_config["mqtt_port"] = int(props.get("mqtt_port", "1883"))
                found_config["ws_url"] = props.get("ws_url", f"ws://{ip}:8765")

                print(f"Maestra: Discovered server at {found_config['api_url']}")
                event.set()

        def remove_service(self, zc, type_, name):
            pass

        def update_service(self, zc, type_, name):
            pass

    zc = Zeroconf()
    try:
        browser = ServiceBrowser(zc, SERVICE_TYPE, Listener())  # noqa: F841
        if not event.wait(timeout=timeout):
            raise TimeoutError(
                f"No Maestra server found within {timeout}s. "
                "Ensure the discovery service is running."
            )
        return found_config
    finally:
        zc.close()


def advertise_device(
    api_url,
    hardware_id,
    device_type,
    name=None,
    ip_address=None,
    metadata=None,
):
    """
    Register this device with the Fleet Manager via HTTP POST to /devices/discover.

    The device will appear as 'pending' in the dashboard until an admin approves it.

    Args:
        api_url: Fleet Manager API URL (e.g. "http://192.168.1.10:8080")
        hardware_id: Unique device identifier (MAC address, serial number, etc.)
        device_type: Device type string (e.g. "touchdesigner", "raspberry_pi")
        name: Human-readable device name (defaults to "TD-<hardware_id>")
        ip_address: IP address of this device (auto-detected if None)
        metadata: Optional dict of extra metadata

    Returns:
        dict with device registration data including 'id' (the device UUID)
    """
    url = f"{api_url.rstrip('/')}/devices/discover"

    if name is None:
        name = f"TD-{hardware_id}"

    if ip_address is None:
        ip_address = _get_local_ip()

    body = {
        "name": name,
        "device_type": device_type,
        "hardware_id": hardware_id,
        "ip_address": ip_address,
    }
    if metadata:
        body["metadata"] = metadata

    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"Maestra: Device registered as pending (id={data.get('id')})")
            return data
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        print(f"Maestra: Error registering device: {e.code} {error_body}")
        raise
    except Exception as e:
        print(f"Maestra: Error registering device: {e}")
        raise


def wait_for_provisioning(api_url, device_id, poll_interval=5.0, timeout=300.0):
    """
    Poll the Fleet Manager until this device is approved and provisioned.

    This is a blocking call — in TouchDesigner, run it from a Script CHOP
    callback or a background thread to avoid freezing the UI.

    Args:
        api_url: Fleet Manager API URL
        device_id: Device UUID string from registration
        poll_interval: Seconds between polling attempts (default 5s)
        timeout: Maximum time to wait in seconds (default 300s / 5 min)

    Returns:
        dict with provisioning config:
            device_id, provision_status, api_url, nats_url,
            mqtt_broker, mqtt_port, ws_url, entity_id, env_vars

    Raises:
        TimeoutError: If not approved within timeout
    """
    import time

    url = f"{api_url.rstrip('/')}/devices/{device_id}/provision"
    elapsed = 0.0

    print(f"Maestra: Waiting for device approval (polling every {poll_interval}s, timeout {timeout}s)...")

    while elapsed < timeout:
        try:
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read().decode())
                print(f"Maestra: Device provisioned (status={data.get('provision_status')})")
                return data
        except urllib.error.HTTPError as e:
            if e.code == 403:
                # Not approved yet — keep polling
                pass
            elif e.code == 404:
                print(f"Maestra: No provisioning record found for device {device_id}")
                raise
            else:
                print(f"Maestra: Provision check returned {e.code}")
        except Exception as e:
            print(f"Maestra: Provision check failed: {e}")

        time.sleep(poll_interval)
        elapsed += poll_interval

    raise TimeoutError(
        f"Device not provisioned within {timeout}s. "
        "Check the Maestra dashboard to approve the device."
    )


# =============================================================================
# Helpers
# =============================================================================

def _get_ip(info):
    """Extract IP address string from a zeroconf ServiceInfo"""
    if info.addresses:
        return socket.inet_ntoa(info.addresses[0])
    return "localhost"


def _get_local_ip():
    """Get the local IP address of this machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
