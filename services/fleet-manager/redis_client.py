"""
Redis client for ephemeral stream and session state.
Uses the existing REDIS_URL env var that was configured but never used.
"""

import os
import json
import redis.asyncio as redis

REDIS_URL = os.getenv('REDIS_URL', 'redis://redis:6379')
ENTITY_STATE_TTL = 30  # Cache entity state for 30 seconds

# Global async Redis connection pool
_redis_pool: redis.Redis = None

# Redis key prefixes
KEY_ENTITY_STATE = "entity:state:{slug}"
KEY_ENTITY_META = "entity:meta:{slug}"


async def init_redis() -> bool:
    """Initialize async Redis connection pool"""
    global _redis_pool
    try:
        _redis_pool = redis.from_url(REDIS_URL, decode_responses=True)
        await _redis_pool.ping()
        print(f"✅ Redis connected: {REDIS_URL}")
        return True
    except Exception as e:
        print(f"⚠️ Redis connection failed: {e}")
        _redis_pool = None
        return False


async def close_redis():
    """Close Redis connection pool"""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.close()
        print("📴 Redis disconnected")
        _redis_pool = None


def get_redis() -> redis.Redis:
    """Get the Redis connection pool"""
    return _redis_pool


async def cache_entity_state(slug: str, state: dict) -> None:
    """Cache entity state by slug with TTL"""
    if not _redis_pool:
        return
    try:
        await _redis_pool.setex(KEY_ENTITY_STATE.format(slug=slug), ENTITY_STATE_TTL, json.dumps(state))
    except Exception as e:
        print(f"Failed to cache entity state for {slug}: {e}")


async def get_cached_entity_state(slug: str) -> dict | None:
    """Get cached entity state by slug, or None if not cached"""
    if not _redis_pool:
        return None
    try:
        data = await _redis_pool.get(KEY_ENTITY_STATE.format(slug=slug))
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Failed to get cached entity state for {slug}: {e}")
        return None


async def invalidate_entity_state_cache(slug: str) -> None:
    """Invalidate cached entity state by slug"""
    if not _redis_pool:
        return
    try:
        await _redis_pool.delete(KEY_ENTITY_STATE.format(slug=slug))
    except Exception as e:
        print(f"Failed to invalidate cache for {slug}: {e}")


async def cache_entity_metadata(slug: str, entity_id, entity_type: str, entity_path: str | None,
                               entity_metadata: dict | None, device_id: str | None) -> None:
    """Cache entity metadata for fast lookups (used by StateManager pattern)"""
    if not _redis_pool:
        return
    try:
        data = {
            "entity_id": str(entity_id),
            "entity_type": entity_type,
            "entity_path": entity_path,
            "entity_metadata": entity_metadata,
            "device_id": device_id
        }
        await _redis_pool.setex(KEY_ENTITY_META.format(slug=slug), 300, json.dumps(data))  # 5 min TTL
    except Exception as e:
        print(f"Failed to cache entity metadata for {slug}: {e}")


async def get_cached_entity_metadata(slug: str) -> dict | None:
    """Get cached entity metadata by slug, or None if not cached"""
    if not _redis_pool:
        return None
    try:
        data = await _redis_pool.get(KEY_ENTITY_META.format(slug=slug))
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Failed to get cached entity metadata for {slug}: {e}")
        return None
