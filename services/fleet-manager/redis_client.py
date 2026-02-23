"""
Redis client for ephemeral stream and session state.
Uses the existing REDIS_URL env var that was configured but never used.
"""

import os
import redis.asyncio as redis

REDIS_URL = os.getenv('REDIS_URL', 'redis://redis:6379')

# Global async Redis connection pool
_redis_pool: redis.Redis = None


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
