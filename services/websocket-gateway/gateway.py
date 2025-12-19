"""
Maestra WebSocket Gateway
Bridges WebSocket connections (browser SDK, web apps) to NATS/Redis
"""

import asyncio
import websockets
import json
import os
from datetime import datetime
from typing import Set
import nats
from nats.aio.client import Client as NATS

# Configuration
WS_PORT = int(os.getenv('WS_PORT', 8765))
NATS_URL = os.getenv('NATS_URL', 'nats://nats:4222')

# Global state
nc: NATS = None
connected_clients: Set[websockets.WebSocketServerProtocol] = set()


async def connect_nats():
    """Connect to NATS message bus"""
    global nc
    nc = await nats.connect(NATS_URL)
    print(f"✅ Connected to NATS at {NATS_URL}")


async def nats_message_handler(msg):
    """
    Handle NATS messages and broadcast to WebSocket clients

    Subscribes to maestra.ws.* and broadcasts to all connected clients
    """
    subject = msg.subject
    data = msg.data.decode()

    print(f"📨 NATS -> WS: {subject}")

    # Broadcast to all connected WebSocket clients
    if connected_clients:
        message = {
            "type": "message",
            "subject": subject,
            "data": json.loads(data) if data else None,
            "timestamp": datetime.utcnow().isoformat()
        }

        # Send to all connected clients
        disconnected = set()
        for client in connected_clients:
            try:
                await client.send(json.dumps(message))
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)

        # Remove disconnected clients
        connected_clients.difference_update(disconnected)


async def subscribe_nats():
    """Subscribe to NATS topics for WebSocket broadcast"""
    if nc:
        # Subscribe to all maestra topics
        await nc.subscribe("maestra.>", cb=nats_message_handler)
        print("📡 Subscribed to NATS topics: maestra.>")


async def handle_websocket_client(websocket: websockets.WebSocketServerProtocol):
    """
    Handle individual WebSocket client connection

    Args:
        websocket: WebSocket connection
    """
    client_id = id(websocket)
    remote_address = websocket.remote_address

    print(f"🔌 Client connected: {remote_address} (ID: {client_id})")

    # Add to connected clients
    connected_clients.add(websocket)

    # Send welcome message
    welcome = {
        "type": "welcome",
        "client_id": client_id,
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Connected to Maestra WebSocket Gateway"
    }
    await websocket.send(json.dumps(welcome))

    try:
        # Listen for messages from client
        async for message in websocket:
            try:
                data = json.loads(message)
                await handle_client_message(websocket, data)
            except json.JSONDecodeError:
                error = {
                    "type": "error",
                    "message": "Invalid JSON",
                    "timestamp": datetime.utcnow().isoformat()
                }
                await websocket.send(json.dumps(error))

    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 Client disconnected: {remote_address} (ID: {client_id})")
    finally:
        # Remove from connected clients
        connected_clients.discard(websocket)


async def handle_client_message(websocket, data: dict):
    """
    Handle message from WebSocket client

    Expected format:
    {
        "type": "publish" | "subscribe" | "unsubscribe",
        "subject": "maestra.topic.name",
        "data": {...}
    }
    """
    msg_type = data.get("type")
    subject = data.get("subject", "")

    print(f"📨 WS -> NATS: {msg_type} {subject}")

    if msg_type == "publish":
        # Publish message to NATS
        if nc and subject:
            message = {
                "timestamp": datetime.utcnow().isoformat(),
                "source": "websocket",
                "data": data.get("data", {})
            }
            await nc.publish(subject, json.dumps(message).encode())

            # Acknowledge
            ack = {
                "type": "ack",
                "subject": subject,
                "timestamp": datetime.utcnow().isoformat()
            }
            await websocket.send(json.dumps(ack))

    elif msg_type == "ping":
        # Respond to ping
        pong = {
            "type": "pong",
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send(json.dumps(pong))

    else:
        # Unknown message type
        error = {
            "type": "error",
            "message": f"Unknown message type: {msg_type}",
            "timestamp": datetime.utcnow().isoformat()
        }
        await websocket.send(json.dumps(error))


async def main():
    """Main gateway loop"""

    print("🚀 Starting Maestra WebSocket Gateway...")

    # Connect to NATS
    await connect_nats()

    # Subscribe to NATS topics
    await subscribe_nats()

    # Start WebSocket server
    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT):
        print(f"🌐 WebSocket server listening on 0.0.0.0:{WS_PORT}")
        print(f"   - Connected to NATS at {NATS_URL}")
        print("\n📚 Usage Example (JavaScript):")
        print(f"   const ws = new WebSocket('ws://localhost:{WS_PORT}');")
        print("   ws.send(JSON.stringify({ type: 'publish', subject: 'maestra.test', data: { hello: 'world' } }));")
        print("\n✅ WebSocket Gateway ready!")

        # Keep running
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            print("\n👋 Shutting down WebSocket Gateway...")
        finally:
            if nc:
                await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
