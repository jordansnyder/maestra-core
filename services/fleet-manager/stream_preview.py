"""
Stream Preview Router — SSE proxy for live stream preview in the dashboard.

The browser can't receive raw UDP/TCP data from publishers, so the Fleet Manager
acts as a consumer proxy: it negotiates with the publisher via the existing
NATS request-reply flow, binds a local socket, receives and decodes the data,
then forwards decoded JSON to the browser via Server-Sent Events (SSE).

Only low-bandwidth stream types (sensor, data, osc, midi, audio) are proxied.
High-bandwidth / platform-specific types (video, NDI, SRT, Spout, Syphon, texture)
return connection info only — the user connects with a dedicated tool.
"""

import asyncio
import json
import logging
import socket
import struct
from datetime import datetime
from typing import AsyncGenerator, Dict, Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from stream_manager import stream_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/streams", tags=["stream-preview"])

# Stream types that support live data proxy
PROXYABLE_TYPES = {"sensor", "data", "osc", "midi", "audio"}

# Stream types that only show connection info
CONNECTION_INFO_TYPES = {"video", "ndi", "srt", "texture", "spout", "syphon"}


# =============================================================================
# Protocol Decoders
# =============================================================================

def decode_sdrf(packet: bytes) -> Optional[Dict[str, Any]]:
    """
    Decode an SDRF (Spectrum Data Radio Format) binary packet.

    Header (36 bytes, little-endian):
      [0:4]   uint32  magic       0x53445246 ("SDRF")
      [4:8]   uint32  seq         sequence number
      [8:16]  float64 center_freq Hz
      [16:24] float64 sample_rate Hz
      [24:32] float64 reserved
      [32:36] uint32  fft_size    number of bins

    Body:
      [36:]   float32[fft_size]   power in dB
    """
    if len(packet) < 36:
        return None

    magic, seq, center_freq, sample_rate, _reserved, fft_size = struct.unpack(
        "<IIdddI", packet[:36]
    )

    if magic != 0x53445246:
        return None

    expected_len = 36 + fft_size * 4
    if len(packet) < expected_len:
        return None

    power_db = list(struct.unpack(f"<{fft_size}f", packet[36:36 + fft_size * 4]))

    return {
        "type": "sensor",
        "seq": seq,
        "center_freq": center_freq,
        "sample_rate": sample_rate,
        "fft_size": fft_size,
        "power_db": power_db,
    }


def decode_json_packet(packet: bytes) -> Optional[Dict[str, Any]]:
    """Decode a JSON-encoded packet (data, OSC, MIDI streams)."""
    try:
        data = json.loads(packet.decode("utf-8"))
        if isinstance(data, dict):
            return data
        return {"payload": data}
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def decode_audio_packet(packet: bytes) -> Optional[Dict[str, Any]]:
    """
    Decode raw audio packet — extract level meters.
    Assumes 16-bit signed PCM, mono or stereo.
    """
    if len(packet) < 4:
        return None

    # Treat as 16-bit signed samples
    num_samples = len(packet) // 2
    if num_samples == 0:
        return None

    samples = struct.unpack(f"<{num_samples}h", packet[:num_samples * 2])

    # Compute RMS level in dB
    import math

    rms = 0.0
    peak = 0
    for s in samples:
        rms += s * s
        if abs(s) > peak:
            peak = abs(s)

    rms = (rms / num_samples) ** 0.5
    rms_db = 20 * math.log10(max(rms / 32768.0, 1e-12))
    peak_db = 20 * math.log10(max(peak / 32768.0, 1e-12))

    return {
        "type": "audio",
        "samples": num_samples,
        "rms_db": round(rms_db, 1),
        "peak_db": round(peak_db, 1),
        "rms_level": round(min(1.0, rms / 32768.0), 4),
        "peak_level": round(min(1.0, peak / 32768.0), 4),
    }


def decode_raw(packet: bytes) -> Dict[str, Any]:
    """Fallback decoder — hex dump of first 256 bytes."""
    return {
        "type": "raw",
        "size": len(packet),
        "hex": packet[:256].hex(),
    }


def get_decoder(stream_type: str):
    """Return the appropriate decoder function for a stream type."""
    decoders = {
        "sensor": decode_sdrf,
        "data": decode_json_packet,
        "osc": decode_json_packet,
        "midi": decode_json_packet,
        "audio": decode_audio_packet,
    }
    return decoders.get(stream_type, decode_raw)


# =============================================================================
# SSE Event Helpers
# =============================================================================

def sse_event(event_type: str, data: Dict[str, Any]) -> str:
    """Format a Server-Sent Event."""
    payload = json.dumps(data, separators=(",", ":"))
    return f"event: {event_type}\ndata: {payload}\n\n"


# =============================================================================
# SSE Preview Endpoint
# =============================================================================

@router.get("/{stream_id}/preview")
async def stream_preview(stream_id: UUID):
    """
    Server-Sent Events endpoint that acts as a consumer proxy for a stream.

    1. Looks up the stream in Redis
    2. For proxyable types: binds a UDP socket, negotiates with publisher,
       receives + decodes data, streams as SSE
    3. For connection-info types: returns stream metadata once
    """
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    # Look up the stream
    stream_data = await stream_manager.get_stream(str(stream_id))
    if not stream_data:
        raise HTTPException(status_code=404, detail="Stream not found or expired")

    stream_type = stream_data.get("stream_type", "")
    protocol = stream_data.get("protocol", "")

    # For non-proxyable types, return connection info as a single SSE burst
    if stream_type not in PROXYABLE_TYPES:
        return StreamingResponse(
            _connection_info_generator(stream_data),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # For proxyable types, set up UDP consumer proxy
    return StreamingResponse(
        _proxy_generator(str(stream_id), stream_data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _connection_info_generator(
    stream_data: Dict[str, Any],
) -> AsyncGenerator[str, None]:
    """Yield connection info for non-proxyable stream types."""
    info = {
        "status": "connection_info",
        "name": stream_data.get("name", ""),
        "stream_type": stream_data.get("stream_type", ""),
        "protocol": stream_data.get("protocol", ""),
        "address": stream_data.get("address", ""),
        "port": stream_data.get("port", 0),
        "publisher_id": stream_data.get("publisher_id", ""),
        "config": stream_data.get("config", {}),
        "metadata": stream_data.get("metadata", {}),
    }
    yield sse_event("info", info)

    # Keep connection alive with heartbeats
    try:
        while True:
            await asyncio.sleep(15)
            yield sse_event("heartbeat", {"time": datetime.utcnow().isoformat()})
    except asyncio.CancelledError:
        return


async def _proxy_generator(
    stream_id: str,
    stream_data: Dict[str, Any],
) -> AsyncGenerator[str, None]:
    """
    Main proxy generator:
    1. Bind a UDP socket
    2. Negotiate with publisher via NATS request-reply
    3. Receive data, decode, yield as SSE events
    """
    stream_type = stream_data.get("stream_type", "")
    decoder = get_decoder(stream_type)
    sock = None
    local_port = 0

    try:
        # Bind an ephemeral UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", 0))
        sock.setblocking(False)
        local_port = sock.getsockname()[1]

        logger.info(
            "Preview proxy: bound UDP port %d for stream %s (%s)",
            local_port, stream_id, stream_type,
        )

        # Get our local IP (best effort for the publisher to reach us)
        local_ip = _get_local_ip()

        # Negotiate with publisher via NATS request-reply
        consumer_id = f"dashboard-preview-{stream_id[:8]}"
        try:
            offer = await stream_manager.request_stream(
                stream_id=stream_id,
                consumer_id=consumer_id,
                consumer_address=local_ip,
                consumer_port=local_port,
            )
        except (ValueError, TimeoutError, RuntimeError) as e:
            yield sse_event("error", {"message": str(e)})
            return

        # Send initial info event
        yield sse_event("info", {
            "status": "connected",
            "name": stream_data.get("name", ""),
            "stream_type": stream_type,
            "protocol": stream_data.get("protocol", ""),
            "publisher_id": stream_data.get("publisher_id", ""),
            "publisher_address": offer.get("publisher_address", ""),
            "publisher_port": offer.get("publisher_port", 0),
            "local_port": local_port,
            "session_id": offer.get("session_id", ""),
        })

        # Receive loop — read UDP packets, decode, yield SSE
        loop = asyncio.get_event_loop()
        seq = 0
        last_heartbeat = asyncio.get_event_loop().time()

        while True:
            try:
                # Non-blocking recv with timeout
                data = await asyncio.wait_for(
                    loop.sock_recv(sock, 65535),
                    timeout=5.0,
                )
            except asyncio.TimeoutError:
                # No data for 5s — send keepalive, check if stream still exists
                now = asyncio.get_event_loop().time()
                if now - last_heartbeat > 10:
                    # Refresh the stream's session heartbeat
                    session_id = offer.get("session_id")
                    if session_id:
                        await stream_manager.refresh_session_ttl(session_id)
                    last_heartbeat = now

                yield sse_event("heartbeat", {
                    "time": datetime.utcnow().isoformat(),
                    "seq": seq,
                })
                continue

            if not data:
                break

            # Decode the packet
            decoded = decoder(data)
            if decoded is None:
                decoded = decode_raw(data)

            decoded["_seq"] = seq
            seq += 1

            yield sse_event("preview", decoded)

            # Periodic session heartbeat
            now = asyncio.get_event_loop().time()
            if now - last_heartbeat > 10:
                session_id = offer.get("session_id")
                if session_id:
                    await stream_manager.refresh_session_ttl(session_id)
                last_heartbeat = now

    except asyncio.CancelledError:
        logger.info("Preview proxy cancelled for stream %s", stream_id)
    except Exception as e:
        logger.error("Preview proxy error for stream %s: %s", stream_id, e)
        try:
            yield sse_event("error", {"message": str(e)})
        except Exception:
            pass
    finally:
        # Cleanup
        if sock:
            try:
                sock.close()
            except Exception:
                pass
        logger.info("Preview proxy closed for stream %s (port %d)", stream_id, local_port)


def _get_local_ip() -> str:
    """Best-effort guess at this host's LAN IP."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
