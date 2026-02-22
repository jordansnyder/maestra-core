"""
Stream helper classes for Maestra SDK.
Provides StreamPublisher and StreamConsumer with automatic heartbeat management.
"""

import asyncio
from typing import Optional, TYPE_CHECKING

from .types import StreamAdvertiseParams, StreamRequestParams, StreamData, StreamOffer

if TYPE_CHECKING:
    from .client import MaestraClient


class StreamPublisher:
    """
    Helper for publishing (advertising) a stream with automatic heartbeat.

    Usage:
        publisher = StreamPublisher(client, StreamAdvertiseParams(
            name="Camera A",
            stream_type="ndi",
            publisher_id="td-01",
            protocol="ndi",
            address="192.168.1.50",
            port=5960,
        ))
        stream = await publisher.start()
        # ... stream is kept alive via automatic heartbeat ...
        await publisher.stop()
    """

    def __init__(
        self,
        client: "MaestraClient",
        params: StreamAdvertiseParams,
        heartbeat_interval: float = 10.0,
    ):
        self._client = client
        self._params = params
        self._heartbeat_interval = heartbeat_interval
        self._stream: Optional[StreamData] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def stream(self) -> Optional[StreamData]:
        """The advertised stream data, or None if not started"""
        return self._stream

    @property
    def stream_id(self) -> Optional[str]:
        """The stream ID, or None if not started"""
        return self._stream.id if self._stream else None

    @property
    def is_active(self) -> bool:
        """Whether the stream is currently advertised and heartbeating"""
        return self._running and self._stream is not None

    async def start(self) -> StreamData:
        """Advertise the stream and start the automatic heartbeat loop"""
        self._stream = await self._client.advertise_stream(self._params)
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        return self._stream

    async def stop(self) -> None:
        """Withdraw the stream and stop the heartbeat loop"""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None
        if self._stream:
            try:
                await self._client.withdraw_stream(self._stream.id)
            except Exception:
                pass  # Stream may have already expired
            self._stream = None

    async def _heartbeat_loop(self) -> None:
        """Internal heartbeat loop that refreshes the stream TTL"""
        while self._running and self._stream:
            await asyncio.sleep(self._heartbeat_interval)
            if not self._running:
                break
            try:
                await self._client.stream_heartbeat(self._stream.id)
            except Exception as e:
                print(f"Stream heartbeat failed: {e}")


class StreamConsumer:
    """
    Helper for consuming a stream with automatic session heartbeat.

    Usage:
        consumer = StreamConsumer(client, stream_id, StreamRequestParams(
            consumer_id="max-01",
            consumer_address="192.168.1.60",
        ))
        offer = await consumer.connect()
        print(f"Connect to {offer.publisher_address}:{offer.publisher_port}")
        # ... session is kept alive via automatic heartbeat ...
        await consumer.disconnect()
    """

    def __init__(
        self,
        client: "MaestraClient",
        stream_id: str,
        params: StreamRequestParams,
        heartbeat_interval: float = 10.0,
    ):
        self._client = client
        self._stream_id = stream_id
        self._params = params
        self._heartbeat_interval = heartbeat_interval
        self._offer: Optional[StreamOffer] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def offer(self) -> Optional[StreamOffer]:
        """The connection offer from the publisher, or None if not connected"""
        return self._offer

    @property
    def session_id(self) -> Optional[str]:
        """The session ID, or None if not connected"""
        return self._offer.session_id if self._offer else None

    @property
    def is_connected(self) -> bool:
        """Whether there is an active session with heartbeat running"""
        return self._running and self._offer is not None

    async def connect(self) -> StreamOffer:
        """Request the stream and start the automatic session heartbeat"""
        self._offer = await self._client.request_stream(self._stream_id, self._params)
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        return self._offer

    async def disconnect(self) -> None:
        """Stop the session and the heartbeat loop"""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None
        if self._offer:
            try:
                await self._client.stop_session(self._offer.session_id)
            except Exception:
                pass  # Session may have already expired
            self._offer = None

    async def _heartbeat_loop(self) -> None:
        """Internal heartbeat loop that refreshes the session TTL"""
        while self._running and self._offer:
            await asyncio.sleep(self._heartbeat_interval)
            if not self._running:
                break
            try:
                await self._client.session_heartbeat(self._offer.session_id)
            except Exception as e:
                print(f"Session heartbeat failed: {e}")
