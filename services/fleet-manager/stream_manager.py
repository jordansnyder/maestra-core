"""
Stream Manager Service
Handles stream advertisement, discovery, session lifecycle via Redis (ephemeral state)
and NATS (events/negotiation). PostgreSQL stores session history.
"""

import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from uuid import UUID, uuid4

from nats.aio.client import Client as NATS
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

# Redis key patterns
STREAM_KEY = "stream:{stream_id}"
STREAM_INDEX_ALL = "streams:all"
STREAM_INDEX_TYPE = "streams:by_type:{stream_type}"
SESSION_KEY = "session:{session_id}"
SESSION_INDEX_STREAM = "sessions:by_stream:{stream_id}"
SESSION_INDEX_ALL = "sessions:all"

# TTL in seconds for Redis keys
STREAM_TTL = 30
SESSION_TTL = 30


class StreamManager:
    """
    Manages stream advertisement, discovery, and session lifecycle.
    Uses Redis for ephemeral state and NATS for events/negotiation.
    """

    def __init__(self):
        self.nc: Optional[NATS] = None
        self.redis: Optional[Redis] = None
        self._connected = False
        self._subscriptions = []

    async def connect(self, nats_client: NATS, redis_client: Redis):
        """Initialize with shared NATS and Redis connections"""
        self.nc = nats_client
        self.redis = redis_client

        if self.nc and not self.nc.is_closed:
            # Subscribe to heartbeat subjects for TTL refresh
            sub1 = await self.nc.subscribe(
                "maestra.stream.heartbeat.>", cb=self._on_stream_heartbeat
            )
            sub2 = await self.nc.subscribe(
                "maestra.stream.session.heartbeat.>", cb=self._on_session_heartbeat
            )
            self._subscriptions = [sub1, sub2]
            print("✅ Stream Manager: NATS subscriptions active")

        self._connected = True
        print("✅ Stream Manager connected")

    async def disconnect(self):
        """Clean up subscriptions"""
        for sub in self._subscriptions:
            try:
                await sub.unsubscribe()
            except Exception:
                pass
        self._subscriptions = []
        self._connected = False
        print("📴 Stream Manager disconnected")

    # =========================================================================
    # Stream Advertisement
    # =========================================================================

    async def advertise_stream(self, advert: Dict[str, Any]) -> Dict[str, Any]:
        """
        Register a new stream in Redis and publish NATS event.
        Returns the full stream info including generated ID.
        """
        stream_id = str(uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        stream_data = {
            "id": stream_id,
            "name": advert["name"],
            "stream_type": advert["stream_type"],
            "publisher_id": advert["publisher_id"],
            "protocol": advert["protocol"],
            "address": advert["address"],
            "port": str(advert["port"]),
            "entity_id": str(advert["entity_id"]) if advert.get("entity_id") else "",
            "device_id": str(advert["device_id"]) if advert.get("device_id") else "",
            "config": json.dumps(advert.get("config", {})),
            "metadata": json.dumps(advert.get("metadata", {})),
            "advertised_at": now,
            "last_heartbeat": now,
        }

        # Store in Redis with TTL
        key = STREAM_KEY.format(stream_id=stream_id)
        await self.redis.hset(key, mapping=stream_data)
        await self.redis.expire(key, STREAM_TTL)

        # Add to index sets
        await self.redis.sadd(STREAM_INDEX_ALL, stream_id)
        await self.redis.sadd(
            STREAM_INDEX_TYPE.format(stream_type=advert["stream_type"]),
            stream_id,
        )

        # Publish NATS event
        if self.nc and not self.nc.is_closed:
            event = {
                "type": "stream_advertised",
                "stream_id": stream_id,
                "stream_type": advert["stream_type"],
                "publisher_id": advert["publisher_id"],
                "name": advert["name"],
                "timestamp": now,
            }
            payload = json.dumps(event).encode()
            await self.nc.publish("maestra.stream.advertise", payload)
            await self.nc.publish(
                f"maestra.stream.advertise.{advert['stream_type']}", payload
            )

            # Also publish to MQTT via the NATS→MQTT bridge so embedded/IoT
            # clients (e.g. ESP32 dashboard) can discover streams.  The bridge
            # subscribes to "maestra.to_mqtt.>" and strips that prefix, so
            # "maestra.to_mqtt.maestra.stream.advertise.sensor" becomes
            # MQTT topic "maestra/stream/advertise/sensor".
            mqtt_event = {
                "id": stream_id,
                "name": advert["name"],
                "stream_type": advert["stream_type"],
                "address": advert["address"],
                "port": advert["port"],
                "config": advert.get("config", {}),
            }
            await self.nc.publish(
                f"maestra.to_mqtt.maestra.stream.advertise.{advert['stream_type']}",
                json.dumps(mqtt_event).encode(),
            )

        return self._parse_stream_data(stream_data)

    async def withdraw_stream(self, stream_id: str):
        """Remove a stream from Redis and publish NATS event"""
        key = STREAM_KEY.format(stream_id=stream_id)
        stream_data = await self.redis.hgetall(key)

        if not stream_data:
            return False

        stream_type = stream_data.get("stream_type", "")

        # Remove from Redis
        await self.redis.delete(key)
        await self.redis.srem(STREAM_INDEX_ALL, stream_id)
        if stream_type:
            await self.redis.srem(
                STREAM_INDEX_TYPE.format(stream_type=stream_type), stream_id
            )

        # Clean up any session references
        session_index_key = SESSION_INDEX_STREAM.format(stream_id=stream_id)
        session_ids = await self.redis.smembers(session_index_key)
        for sid in session_ids:
            await self.redis.delete(SESSION_KEY.format(session_id=sid))
            await self.redis.srem(SESSION_INDEX_ALL, sid)
        await self.redis.delete(session_index_key)

        # Publish NATS event
        if self.nc and not self.nc.is_closed:
            event = {
                "type": "stream_withdrawn",
                "stream_id": stream_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            await self.nc.publish(
                f"maestra.stream.withdraw.{stream_id}",
                json.dumps(event).encode(),
            )

        return True

    # =========================================================================
    # Stream Discovery
    # =========================================================================

    async def list_streams(self, stream_type: str = None) -> List[Dict[str, Any]]:
        """List active streams from Redis, optionally filtered by type"""
        if stream_type:
            index_key = STREAM_INDEX_TYPE.format(stream_type=stream_type)
        else:
            index_key = STREAM_INDEX_ALL

        stream_ids = await self.redis.smembers(index_key)
        streams = []

        for sid in stream_ids:
            key = STREAM_KEY.format(stream_id=sid)
            data = await self.redis.hgetall(key)
            if data:
                stream_info = self._parse_stream_data(data)
                # Count active sessions
                session_count = await self.redis.scard(
                    SESSION_INDEX_STREAM.format(stream_id=sid)
                )
                stream_info["active_sessions"] = session_count
                streams.append(stream_info)
            else:
                # Stream expired, clean up stale index entry
                await self.redis.srem(STREAM_INDEX_ALL, sid)
                if stream_type:
                    await self.redis.srem(index_key, sid)

        return streams

    async def get_stream(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get a single stream from Redis"""
        key = STREAM_KEY.format(stream_id=stream_id)
        data = await self.redis.hgetall(key)
        if not data:
            return None

        stream_info = self._parse_stream_data(data)
        session_count = await self.redis.scard(
            SESSION_INDEX_STREAM.format(stream_id=stream_id)
        )
        stream_info["active_sessions"] = session_count
        return stream_info

    # =========================================================================
    # Stream Negotiation (NATS Request-Reply)
    # =========================================================================

    async def request_stream(
        self,
        stream_id: str,
        consumer_id: str,
        consumer_address: str,
        consumer_port: Optional[int] = None,
        config: Optional[Dict[str, Any]] = None,
        db_session: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """
        Request to consume a stream via NATS request-reply.
        Returns the StreamOffer with connection details.
        """
        # Verify stream exists in Redis
        stream_data = await self.get_stream(stream_id)
        if not stream_data:
            raise ValueError("Stream not found or expired")

        if not self.nc or self.nc.is_closed:
            raise RuntimeError("NATS not connected")

        # Build request payload
        request_payload = {
            "stream_id": stream_id,
            "consumer_id": consumer_id,
            "consumer_address": consumer_address,
            "consumer_port": consumer_port,
            "config": config or {},
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        # NATS request-reply to publisher (5s timeout)
        subject = f"maestra.stream.request.{stream_id}"
        try:
            response = await self.nc.request(
                subject,
                json.dumps(request_payload).encode(),
                timeout=5.0,
            )
            offer_data = json.loads(response.data.decode())
        except asyncio.TimeoutError:
            raise TimeoutError("Publisher did not respond within 5 seconds")
        except Exception as e:
            raise RuntimeError(f"NATS request failed: {e}")

        if not offer_data.get("accepted", False):
            raise ValueError(
                offer_data.get("reason", "Publisher rejected the request")
            )

        # Create session
        session_id = str(uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        session_data = {
            "session_id": session_id,
            "stream_id": stream_id,
            "stream_name": stream_data["name"],
            "stream_type": stream_data["stream_type"],
            "publisher_id": stream_data["publisher_id"],
            "publisher_address": offer_data.get(
                "address", stream_data["address"]
            ),
            "publisher_port": str(
                offer_data.get("port", stream_data["port"])
            ),
            "consumer_id": consumer_id,
            "consumer_address": consumer_address,
            "protocol": offer_data.get("protocol", stream_data["protocol"]),
            "transport_config": json.dumps(
                offer_data.get("transport_config", {})
            ),
            "started_at": now,
            "status": "active",
        }

        # Store session in Redis
        sess_key = SESSION_KEY.format(session_id=session_id)
        await self.redis.hset(sess_key, mapping=session_data)
        await self.redis.expire(sess_key, SESSION_TTL)
        await self.redis.sadd(
            SESSION_INDEX_STREAM.format(stream_id=stream_id), session_id
        )
        await self.redis.sadd(SESSION_INDEX_ALL, session_id)

        # Log to Postgres (fire-and-forget)
        if db_session:
            asyncio.create_task(
                self._log_session_start(db_session, session_data)
            )

        # Publish lifecycle event
        lifecycle_event = {
            "type": "session_started",
            **session_data,
            "transport_config": offer_data.get("transport_config", {}),
        }
        await self.nc.publish(
            "maestra.stream.session.started",
            json.dumps(lifecycle_event).encode(),
        )

        return {
            "session_id": session_id,
            "stream_id": stream_id,
            "stream_name": stream_data["name"],
            "stream_type": stream_data["stream_type"],
            "protocol": offer_data.get("protocol", stream_data["protocol"]),
            "publisher_address": offer_data.get(
                "address", stream_data["address"]
            ),
            "publisher_port": int(
                offer_data.get("port", stream_data["port"])
            ),
            "transport_config": offer_data.get("transport_config", {}),
        }

    # =========================================================================
    # Session Management
    # =========================================================================

    async def list_sessions(
        self, stream_id: str = None
    ) -> List[Dict[str, Any]]:
        """List active sessions from Redis"""
        if stream_id:
            index_key = SESSION_INDEX_STREAM.format(stream_id=stream_id)
        else:
            index_key = SESSION_INDEX_ALL

        session_ids = await self.redis.smembers(index_key)
        sessions = []

        for sid in session_ids:
            key = SESSION_KEY.format(session_id=sid)
            data = await self.redis.hgetall(key)
            if data:
                sessions.append(self._parse_session_data(data))
            else:
                # Session expired, clean up stale index entry
                await self.redis.srem(SESSION_INDEX_ALL, sid)
                if stream_id:
                    await self.redis.srem(index_key, sid)

        return sessions

    async def stop_session(
        self,
        session_id: str,
        db_session: Optional[AsyncSession] = None,
    ):
        """Stop a session and clean up"""
        key = SESSION_KEY.format(session_id=session_id)
        session_data = await self.redis.hgetall(key)

        if not session_data:
            return False

        stream_id = session_data.get("stream_id", "")

        # Remove from Redis
        await self.redis.delete(key)
        await self.redis.srem(SESSION_INDEX_ALL, session_id)
        if stream_id:
            await self.redis.srem(
                SESSION_INDEX_STREAM.format(stream_id=stream_id), session_id
            )

        # Update Postgres record
        if db_session:
            asyncio.create_task(
                self._log_session_end(db_session, session_id, session_data)
            )

        # Publish lifecycle event
        if self.nc and not self.nc.is_closed:
            event = {
                "type": "session_stopped",
                "session_id": session_id,
                "stream_id": stream_id,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            await self.nc.publish(
                "maestra.stream.session.stopped",
                json.dumps(event).encode(),
            )

        return True

    # =========================================================================
    # Heartbeat Handlers
    # =========================================================================

    async def refresh_stream_ttl(self, stream_id: str) -> bool:
        """Refresh a stream's TTL in Redis and re-broadcast to MQTT so
        late-joining IoT/embedded clients (e.g. ESP32 dashboard) can
        discover active streams."""
        key = STREAM_KEY.format(stream_id=stream_id)
        exists = await self.redis.exists(key)
        if exists:
            await self.redis.hset(
                key, "last_heartbeat", datetime.utcnow().isoformat() + "Z"
            )
            await self.redis.expire(key, STREAM_TTL)
            # Re-broadcast stream info to MQTT for late-joining clients
            await self._rebroadcast_stream_to_mqtt(stream_id)
            return True
        return False

    async def refresh_session_ttl(self, session_id: str) -> bool:
        """Refresh a session's TTL in Redis"""
        key = SESSION_KEY.format(session_id=session_id)
        exists = await self.redis.exists(key)
        if exists:
            await self.redis.expire(key, SESSION_TTL)
            return True
        return False

    async def _on_stream_heartbeat(self, msg):
        """Handle stream heartbeat via NATS"""
        try:
            subject_parts = msg.subject.split(".")
            if len(subject_parts) >= 4:
                stream_id = subject_parts[3]
                await self.refresh_stream_ttl(stream_id)
        except Exception as e:
            logger.warning(f"Stream heartbeat error: {e}")

    async def _rebroadcast_stream_to_mqtt(self, stream_id: str):
        """Re-publish stream advertisement to MQTT via the NATS→MQTT bridge
        so embedded/IoT clients that connected after the initial advertisement
        can still discover active streams."""
        if not self.nc or self.nc.is_closed:
            return
        key = STREAM_KEY.format(stream_id=stream_id)
        data = await self.redis.hgetall(key)
        if not data:
            return
        stream_type = data.get("stream_type", "sensor")
        try:
            port_val = int(data.get("port", 0))
        except (ValueError, TypeError):
            port_val = 0
        mqtt_event = {
            "id": data.get("id", stream_id),
            "name": data.get("name", ""),
            "stream_type": stream_type,
            "address": data.get("address", ""),
            "port": port_val,
            "config": json.loads(data.get("config", "{}")),
        }
        await self.nc.publish(
            f"maestra.to_mqtt.maestra.stream.advertise.{stream_type}",
            json.dumps(mqtt_event).encode(),
        )

    async def _on_session_heartbeat(self, msg):
        """Handle session heartbeat via NATS"""
        try:
            subject_parts = msg.subject.split(".")
            if len(subject_parts) >= 5:
                session_id = subject_parts[4]
                await self.refresh_session_ttl(session_id)
        except Exception as e:
            logger.warning(f"Session heartbeat error: {e}")

    # =========================================================================
    # Postgres Logging
    # =========================================================================

    async def _log_session_start(
        self, db_session: AsyncSession, session_data: Dict[str, Any]
    ):
        """Log session start to Postgres hypertable"""
        try:
            async with db_session.begin():
                await db_session.execute(
                    text("""
                        INSERT INTO stream_sessions
                        (time, session_id, stream_id, stream_name, stream_type,
                         publisher_id, publisher_address, consumer_id, consumer_address,
                         protocol, transport_config, status)
                        VALUES (:time, :session_id, :stream_id, :stream_name, :stream_type,
                                :publisher_id, :publisher_address, :consumer_id, :consumer_address,
                                :protocol, :transport_config, 'active')
                    """),
                    {
                        "time": datetime.utcnow(),
                        "session_id": session_data["session_id"],
                        "stream_id": session_data["stream_id"],
                        "stream_name": session_data["stream_name"],
                        "stream_type": session_data["stream_type"],
                        "publisher_id": session_data["publisher_id"],
                        "publisher_address": session_data.get(
                            "publisher_address", ""
                        ),
                        "consumer_id": session_data["consumer_id"],
                        "consumer_address": session_data.get(
                            "consumer_address", ""
                        ),
                        "protocol": session_data.get("protocol", ""),
                        "transport_config": session_data.get(
                            "transport_config", "{}"
                        ),
                    },
                )
        except Exception as e:
            logger.error(f"Failed to log session start: {e}")

    async def _log_session_end(
        self,
        db_session: AsyncSession,
        session_id: str,
        session_data: Dict[str, Any],
    ):
        """Update session record in Postgres with end time and duration"""
        try:
            started_at = session_data.get("started_at", "")
            duration = None
            if started_at:
                try:
                    start = datetime.fromisoformat(
                        started_at.replace("Z", "+00:00")
                    )
                    duration = (
                        datetime.utcnow() - start.replace(tzinfo=None)
                    ).total_seconds()
                except Exception:
                    pass

            async with db_session.begin():
                await db_session.execute(
                    text("""
                        UPDATE stream_sessions
                        SET status = 'stopped',
                            ended_at = :ended_at,
                            duration_seconds = :duration
                        WHERE session_id = :session_id
                    """),
                    {
                        "session_id": session_id,
                        "ended_at": datetime.utcnow(),
                        "duration": duration,
                    },
                )
        except Exception as e:
            logger.error(f"Failed to log session end: {e}")

    # =========================================================================
    # Helpers
    # =========================================================================

    @staticmethod
    def _parse_stream_data(data: Dict[str, str]) -> Dict[str, Any]:
        """Parse Redis hash data into a stream info dict"""
        return {
            "id": data.get("id", ""),
            "name": data.get("name", ""),
            "stream_type": data.get("stream_type", ""),
            "publisher_id": data.get("publisher_id", ""),
            "protocol": data.get("protocol", ""),
            "address": data.get("address", ""),
            "port": int(data.get("port", 0)),
            "entity_id": data.get("entity_id") if data.get("entity_id") and data.get("entity_id") != "None" else None,
            "device_id": data.get("device_id") if data.get("device_id") and data.get("device_id") != "None" else None,
            "config": json.loads(data.get("config", "{}")),
            "metadata": json.loads(data.get("metadata", "{}")),
            "advertised_at": data.get("advertised_at", ""),
            "last_heartbeat": data.get("last_heartbeat", ""),
            "active_sessions": 0,
        }

    @staticmethod
    def _parse_session_data(data: Dict[str, str]) -> Dict[str, Any]:
        """Parse Redis hash data into a session dict"""
        return {
            "session_id": data.get("session_id", ""),
            "stream_id": data.get("stream_id", ""),
            "stream_name": data.get("stream_name", ""),
            "stream_type": data.get("stream_type", ""),
            "publisher_id": data.get("publisher_id", ""),
            "publisher_address": data.get("publisher_address", ""),
            "consumer_id": data.get("consumer_id", ""),
            "consumer_address": data.get("consumer_address", ""),
            "protocol": data.get("protocol", ""),
            "transport_config": json.loads(
                data.get("transport_config", "{}")
            ),
            "started_at": data.get("started_at", ""),
            "status": data.get("status", "active"),
        }

    @property
    def is_connected(self) -> bool:
        return self._connected


# Global stream manager instance
stream_manager = StreamManager()
