"""
Maestra WebSocket Gateway
Bridges WebSocket connections (browser SDK, web apps) to NATS/Redis

Features:
- Server-side topic filtering: clients subscribe to NATS-style patterns
- Per-client send queues with backpressure (drop-oldest when full)
- Backward compatible: clients with no subscriptions receive everything
"""

import asyncio
import logging
import json
import os
from datetime import datetime
from typing import Dict, List, Optional

import nats
import websockets
from nats.aio.client import Client as NATS

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("maestra.ws-gateway")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WS_PORT = int(os.getenv("WS_PORT", 8765))
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
CLIENT_QUEUE_SIZE = int(os.getenv("WS_QUEUE_SIZE", 100))

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
nc: Optional[NATS] = None
# Map from websocket -> ClientState
clients: Dict[websockets.WebSocketServerProtocol, "ClientState"] = {}


# ---------------------------------------------------------------------------
# NATS-style subject matching
# ---------------------------------------------------------------------------

def _subject_matches(pattern: str, subject: str) -> bool:
    """Match a NATS subject against a pattern.

    Rules (dot-separated tokens):
      *  matches exactly one token
      >  matches one or more tokens (must be last token)
    """
    pat_tokens = pattern.split(".")
    sub_tokens = subject.split(".")

    for i, pt in enumerate(pat_tokens):
        if pt == ">":
            # '>' must be the last token and matches one-or-more remaining
            return i < len(sub_tokens)
        if i >= len(sub_tokens):
            return False
        if pt != "*" and pt != sub_tokens[i]:
            return False

    return len(pat_tokens) == len(sub_tokens)


def _any_pattern_matches(patterns: List[str], subject: str) -> bool:
    """Return True if *any* pattern in the list matches the subject."""
    return any(_subject_matches(p, subject) for p in patterns)


# ---------------------------------------------------------------------------
# Per-client state
# ---------------------------------------------------------------------------

class ClientState:
    """Holds the send queue and subscription filters for one WebSocket client."""

    __slots__ = ("ws", "queue", "sender_task", "subscriptions")

    def __init__(self, ws: websockets.WebSocketServerProtocol):
        self.ws = ws
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=CLIENT_QUEUE_SIZE)
        self.sender_task: Optional[asyncio.Task] = None
        # None means "no subscribe message ever received -> forward everything"
        self.subscriptions: Optional[List[str]] = None

    def accepts(self, subject: str) -> bool:
        """Check whether this client should receive a message on *subject*."""
        if self.subscriptions is None:
            return True  # backward-compat: no filter -> everything
        if not self.subscriptions:
            return False  # explicitly subscribed to nothing
        return _any_pattern_matches(self.subscriptions, subject)

    def enqueue(self, message: str) -> None:
        """Put a message into the client queue, dropping the oldest if full."""
        if self.queue.full():
            try:
                self.queue.get_nowait()  # drop oldest
            except asyncio.QueueEmpty:
                pass
        try:
            self.queue.put_nowait(message)
        except asyncio.QueueFull:
            pass  # should not happen after the drop above

    async def drain(self) -> None:
        """Sender coroutine: pull from queue and send over the websocket."""
        try:
            while True:
                message = await self.queue.get()
                try:
                    await self.ws.send(message)
                except websockets.exceptions.ConnectionClosed:
                    break
        except asyncio.CancelledError:
            pass


# ---------------------------------------------------------------------------
# NATS handling
# ---------------------------------------------------------------------------

async def connect_nats() -> None:
    """Connect to NATS message bus."""
    global nc
    nc = await nats.connect(NATS_URL)
    logger.info("Connected to NATS at %s", NATS_URL)


async def nats_message_handler(msg) -> None:
    """Fan-out a NATS message to every matching WebSocket client queue."""
    subject = msg.subject
    logger.debug("NATS -> WS: %s", subject)

    if not clients:
        return

    # Parse payload once
    try:
        data = msg.data.decode()
        parsed_data = json.loads(data) if data else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raw = msg.data[:500].decode(errors="replace") if msg.data else None
        parsed_data = {"_raw": raw, "_error": "non-JSON payload"}

    envelope = json.dumps({
        "type": "message",
        "subject": subject,
        "data": parsed_data,
        "timestamp": datetime.utcnow().isoformat(),
    })

    for state in list(clients.values()):
        if state.accepts(subject):
            state.enqueue(envelope)


async def subscribe_nats() -> None:
    """Subscribe to the NATS wildcard for all maestra topics."""
    if nc:
        await nc.subscribe("maestra.>", cb=nats_message_handler)
        logger.info("Subscribed to NATS topics: maestra.>")


# ---------------------------------------------------------------------------
# WebSocket client lifecycle
# ---------------------------------------------------------------------------

async def handle_websocket_client(websocket: websockets.WebSocketServerProtocol) -> None:
    """Handle an individual WebSocket client connection."""
    client_id = id(websocket)
    remote_address = websocket.remote_address
    logger.info("Client connected: %s (ID: %s)", remote_address, client_id)

    state = ClientState(websocket)
    state.sender_task = asyncio.create_task(state.drain())
    clients[websocket] = state

    # Send welcome (directly, not via queue — must arrive first)
    welcome = json.dumps({
        "type": "welcome",
        "client_id": client_id,
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Connected to Maestra WebSocket Gateway",
    })
    try:
        await websocket.send(welcome)
    except websockets.exceptions.ConnectionClosed:
        state.sender_task.cancel()
        clients.pop(websocket, None)
        return

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                await handle_client_message(state, data)
            except json.JSONDecodeError:
                _enqueue_response(state, {
                    "type": "error",
                    "message": "Invalid JSON",
                    "timestamp": datetime.utcnow().isoformat(),
                })
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        logger.info("Client disconnected: %s (ID: %s)", remote_address, client_id)
        state.sender_task.cancel()
        clients.pop(websocket, None)


# ---------------------------------------------------------------------------
# Client message handling
# ---------------------------------------------------------------------------

def _enqueue_response(state: ClientState, payload: dict) -> None:
    """Convenience: serialize and enqueue a dict for the client."""
    state.enqueue(json.dumps(payload))


async def handle_client_message(state: ClientState, data: dict) -> None:
    """Route an inbound message from a WebSocket client."""
    msg_type = data.get("type")

    if msg_type == "publish":
        subject = data.get("subject", "")
        logger.debug("WS -> NATS: publish %s", subject)
        if nc and subject:
            message = {
                "timestamp": datetime.utcnow().isoformat(),
                "source": "websocket",
                "data": data.get("data", {}),
            }
            await nc.publish(subject, json.dumps(message).encode())
            _enqueue_response(state, {
                "type": "ack",
                "subject": subject,
                "timestamp": datetime.utcnow().isoformat(),
            })

    elif msg_type == "subscribe":
        # Accept both {"subjects": ["a", "b"]} (new) and {"subject": "a"} (legacy)
        subjects = data.get("subjects")
        if subjects is None and isinstance(data.get("subject"), str):
            subjects = [data["subject"]]
        if not isinstance(subjects, list):
            _enqueue_response(state, {
                "type": "error",
                "message": "subscribe requires a 'subjects' array or 'subject' string",
                "timestamp": datetime.utcnow().isoformat(),
            })
            return
        # Initialize if first subscribe, then add patterns
        if state.subscriptions is None:
            state.subscriptions = []
        for pattern in subjects:
            if isinstance(pattern, str) and pattern not in state.subscriptions:
                state.subscriptions.append(pattern)
        logger.info(
            "Client %s subscribed to %s (total: %d patterns)",
            id(state.ws), subjects, len(state.subscriptions),
        )
        _enqueue_response(state, {
            "type": "subscribed",
            "subjects": state.subscriptions[:],
            "timestamp": datetime.utcnow().isoformat(),
        })

    elif msg_type == "unsubscribe":
        # Accept both {"subjects": ["a", "b"]} (new) and {"subject": "a"} (legacy)
        subjects = data.get("subjects")
        if subjects is None and isinstance(data.get("subject"), str):
            subjects = [data["subject"]]
        if not isinstance(subjects, list):
            _enqueue_response(state, {
                "type": "error",
                "message": "unsubscribe requires a 'subjects' array or 'subject' string",
                "timestamp": datetime.utcnow().isoformat(),
            })
            return
        if state.subscriptions is not None:
            for pattern in subjects:
                try:
                    state.subscriptions.remove(pattern)
                except ValueError:
                    pass
        logger.info(
            "Client %s unsubscribed from %s (remaining: %s)",
            id(state.ws), subjects,
            len(state.subscriptions) if state.subscriptions is not None else "all",
        )
        _enqueue_response(state, {
            "type": "unsubscribed",
            "subjects": state.subscriptions[:] if state.subscriptions is not None else None,
            "timestamp": datetime.utcnow().isoformat(),
        })

    elif msg_type == "ping":
        _enqueue_response(state, {
            "type": "pong",
            "timestamp": datetime.utcnow().isoformat(),
        })

    else:
        logger.debug("Unknown message type from client: %s", msg_type)
        _enqueue_response(state, {
            "type": "error",
            "message": f"Unknown message type: {msg_type}",
            "timestamp": datetime.utcnow().isoformat(),
        })


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

async def main() -> None:
    """Main gateway loop."""
    logger.info("Starting Maestra WebSocket Gateway...")

    await connect_nats()
    await subscribe_nats()

    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT):
        logger.info("WebSocket server listening on 0.0.0.0:%d", WS_PORT)
        logger.info("Connected to NATS at %s", NATS_URL)
        logger.info("Per-client queue size: %d", CLIENT_QUEUE_SIZE)
        logger.info("WebSocket Gateway ready")
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            logger.info("Shutting down WebSocket Gateway...")
        finally:
            if nc:
                await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
