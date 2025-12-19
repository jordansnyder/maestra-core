"""
Maestra OSC Gateway
Bridges OSC messages (from TouchDesigner, Max/MSP, etc.) to NATS/Redis
"""

import asyncio
import os
import json
from datetime import datetime
from pythonosc import dispatcher, osc_server, udp_client
from pythonosc.osc_server import AsyncIOOSCUDPServer
import nats
from nats.aio.client import Client as NATS

# Configuration
OSC_IN_PORT = int(os.getenv('OSC_IN_PORT', 57120))
OSC_OUT_PORT = int(os.getenv('OSC_OUT_PORT', 57121))
NATS_URL = os.getenv('NATS_URL', 'nats://nats:4222')

# Global NATS client
nc: NATS = None
osc_client = None


async def connect_nats():
    """Connect to NATS message bus"""
    global nc
    nc = await nats.connect(NATS_URL)
    print(f"✅ Connected to NATS at {NATS_URL}")


async def osc_handler(address: str, *args):
    """
    Handle incoming OSC messages and forward to NATS

    Args:
        address: OSC address pattern (e.g., /device/sensor/temperature)
        args: OSC message arguments
    """
    print(f"📨 OSC received: {address} {args}")

    if nc is None:
        print("⚠️  NATS not connected, skipping message")
        return

    # Convert OSC message to JSON
    message = {
        "timestamp": datetime.utcnow().isoformat(),
        "source": "osc",
        "address": address,
        "values": list(args)
    }

    # Publish to NATS topic based on OSC address
    # Convert /device/sensor/temperature to maestra.osc.device.sensor.temperature
    nats_subject = f"maestra.osc{address.replace('/', '.')}"

    try:
        await nc.publish(nats_subject, json.dumps(message).encode())
        print(f"✅ Published to NATS: {nats_subject}")
    except Exception as e:
        print(f"❌ Error publishing to NATS: {e}")


async def nats_to_osc_handler(msg):
    """
    Handle NATS messages and forward to OSC

    Subscribes to maestra.to_osc.* and sends to OSC clients
    """
    subject = msg.subject
    data = json.loads(msg.data.decode())

    print(f"📨 NATS received: {subject}")

    # Extract OSC address and values from NATS message
    osc_address = data.get('address', '/')
    osc_values = data.get('values', [])
    osc_target = data.get('target', '127.0.0.1')

    # Send OSC message
    if osc_client:
        try:
            osc_client.send_message(osc_address, osc_values)
            print(f"✅ Sent OSC to {osc_target}: {osc_address} {osc_values}")
        except Exception as e:
            print(f"❌ Error sending OSC: {e}")


async def init_osc_server():
    """Initialize OSC server to receive messages"""

    # Create OSC dispatcher
    disp = dispatcher.Dispatcher()
    disp.set_default_handler(osc_handler)

    # Create and start OSC server
    server = AsyncIOOSCUDPServer(
        ("0.0.0.0", OSC_IN_PORT),
        disp,
        asyncio.get_event_loop()
    )

    transport, protocol = await server.create_serve_endpoint()
    print(f"🎛️  OSC Server listening on 0.0.0.0:{OSC_IN_PORT}")

    return transport


async def init_osc_client():
    """Initialize OSC client for sending messages"""
    global osc_client
    osc_client = udp_client.SimpleUDPClient("127.0.0.1", OSC_OUT_PORT)
    print(f"📡 OSC Client ready to send on port {OSC_OUT_PORT}")


async def subscribe_nats_to_osc():
    """Subscribe to NATS topics and forward to OSC"""
    if nc:
        await nc.subscribe("maestra.to_osc.*", cb=nats_to_osc_handler)
        print("📡 Subscribed to NATS topic: maestra.to_osc.*")


async def main():
    """Main gateway loop"""

    print("🚀 Starting Maestra OSC Gateway...")

    # Connect to NATS
    await connect_nats()

    # Initialize OSC client
    await init_osc_client()

    # Subscribe to NATS for outgoing OSC messages
    await subscribe_nats_to_osc()

    # Start OSC server
    transport = await init_osc_server()

    print("✅ OSC Gateway ready!")
    print(f"   - Receiving OSC on UDP port {OSC_IN_PORT}")
    print(f"   - Sending OSC on UDP port {OSC_OUT_PORT}")
    print(f"   - Connected to NATS at {NATS_URL}")
    print("\n📚 Usage Examples:")
    print("   TouchDesigner: Send OSC to this gateway's IP on port", OSC_IN_PORT)
    print("   Max/MSP: [udpsend] to this gateway's IP on port", OSC_IN_PORT)
    print("   SuperCollider: NetAddr(\"gateway-ip\",", OSC_IN_PORT, ")")

    # Keep running
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        print("\n👋 Shutting down OSC Gateway...")
    finally:
        transport.close()
        if nc:
            await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
