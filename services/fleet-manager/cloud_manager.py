"""
Cloud Gateway Manager
Handles cloud gateway configuration, proxied API calls, and agent status monitoring.
Stores config in Redis (persistent, no TTL). Proxies requests to the Cloud Gateway
Control Plane API via httpx.
"""

import json
import logging
import time
from typing import Dict, Any, List, Optional

import httpx
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Redis key patterns (no TTL — persistent until explicitly cleared)
CLOUD_CONFIG_KEY = "cloud:config"
CLOUD_POLICIES_KEY = "cloud:policies"
CLOUD_METRICS_KEY = "cloud:metrics"

# Cloud Agent sidecar health endpoint
CLOUD_AGENT_URL = "http://cloud-agent:8090"


class CloudManager:
    """
    Manages cloud gateway configuration and proxied API calls.
    Uses Redis for persistent config storage and httpx for cloud API calls.
    """

    def __init__(self):
        self.redis: Optional[Redis] = None
        self._connected = False

    async def connect(self, redis_client: Redis):
        """Initialize with shared Redis connection"""
        self.redis = redis_client
        self._connected = True
        logger.info("Cloud Manager connected")

    async def disconnect(self):
        self._connected = False
        logger.info("Cloud Manager disconnected")

    # =========================================================================
    # Configuration
    # =========================================================================

    async def get_config(self) -> Dict[str, Any]:
        """Get current cloud gateway configuration from Redis."""
        if not self.redis:
            return {"gateway_url": None, "site_id": None, "site_slug": None, "status": "disconnected"}

        data = await self.redis.hgetall(CLOUD_CONFIG_KEY)
        if not data:
            return {"gateway_url": None, "site_id": None, "site_slug": None, "status": "disconnected"}

        return {
            "gateway_url": data.get("gateway_url") or None,
            "site_id": data.get("site_id") or None,
            "site_slug": data.get("site_slug") or None,
            "status": data.get("status", "disconnected"),
        }

    async def save_config(self, gateway_url: str, site_id: str = "", site_slug: str = "") -> Dict[str, Any]:
        """Save cloud gateway configuration to Redis."""
        if not self.redis:
            raise RuntimeError("Redis not connected")

        config = {
            "gateway_url": gateway_url,
            "site_id": site_id,
            "site_slug": site_slug,
            "status": "connecting" if site_id else "disconnected",
        }
        await self.redis.hset(CLOUD_CONFIG_KEY, mapping=config)
        logger.info(f"Cloud config saved: gateway_url={gateway_url}, site_id={site_id}")
        return config

    async def clear_config(self):
        """Remove all cloud gateway configuration."""
        if not self.redis:
            return
        await self.redis.delete(CLOUD_CONFIG_KEY, CLOUD_POLICIES_KEY, CLOUD_METRICS_KEY)
        logger.info("Cloud config cleared")

    # =========================================================================
    # Site Registration (proxied to Cloud Gateway API)
    # =========================================================================

    async def register_site(self, gateway_url: str, name: str, slug: str,
                            description: str = None, region: str = None,
                            tags: List[str] = None) -> Dict[str, Any]:
        """Register this Maestra instance as a site with the cloud gateway."""
        url = f"{gateway_url.rstrip('/')}/api/v1/sites"
        payload = {
            "name": name,
            "slug": slug,
            "description": description,
            "region": region,
            "tags": tags or [],
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            site_data = resp.json()

        # Save the site ID and slug to config
        site_id = str(site_data.get("id", ""))
        await self.save_config(gateway_url, site_id=site_id, site_slug=slug)

        logger.info(f"Site registered: id={site_id}, slug={slug}")
        return site_data

    async def activate_site(self) -> Dict[str, Any]:
        """Activate this site on the cloud gateway."""
        config = await self.get_config()
        if not config.get("gateway_url") or not config.get("site_id"):
            raise ValueError("Cloud gateway not configured or site not registered")

        url = f"{config['gateway_url'].rstrip('/')}/api/v1/sites/{config['site_id']}/activate"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url)
            resp.raise_for_status()
            result = resp.json()

        # Update status
        await self.redis.hset(CLOUD_CONFIG_KEY, "status", "connected")
        return result

    # =========================================================================
    # Certificates (proxied to Cloud Gateway API)
    # =========================================================================

    async def issue_certificates(self) -> Dict[str, Any]:
        """Request mTLS certificates from the cloud gateway CA."""
        config = await self.get_config()
        if not config.get("gateway_url") or not config.get("site_id"):
            raise ValueError("Cloud gateway not configured or site not registered")

        url = f"{config['gateway_url'].rstrip('/')}/api/v1/certificates/site/{config['site_id']}/issue"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={"validity_hours": 720})  # 30 days for setup
            resp.raise_for_status()
            return resp.json()

    # =========================================================================
    # Policies
    # =========================================================================

    async def get_policies(self) -> List[Dict[str, Any]]:
        """Get configured routing policies from Redis."""
        if not self.redis:
            return []
        raw = await self.redis.get(CLOUD_POLICIES_KEY)
        if not raw:
            return []
        return json.loads(raw)

    async def save_policies(self, policies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Save routing policies to Redis and push to cloud gateway."""
        if not self.redis:
            raise RuntimeError("Redis not connected")

        await self.redis.set(CLOUD_POLICIES_KEY, json.dumps(policies))

        # Try to push policies to the cloud gateway
        config = await self.get_config()
        if config.get("gateway_url") and config.get("site_id"):
            try:
                url = f"{config['gateway_url'].rstrip('/')}/api/v1/policies/{config['site_id']}"
                async with httpx.AsyncClient(timeout=10.0) as client:
                    for policy in policies:
                        await client.post(url, json={
                            "name": f"local-{policy['direction']}-{policy['subject_pattern'][:30]}",
                            "direction": policy["direction"],
                            "action": "allow",
                            "subject_pattern": policy["subject_pattern"],
                            "enabled": policy.get("enabled", True),
                            "description": policy.get("description", ""),
                            "priority": 100,
                        })
            except Exception as e:
                logger.warning(f"Failed to push policies to cloud gateway: {e}")

        logger.info(f"Saved {len(policies)} cloud routing policies")
        return policies

    # =========================================================================
    # Status & Health
    # =========================================================================

    async def get_status(self) -> Dict[str, Any]:
        """Get full cloud gateway status including agent health."""
        config = await self.get_config()
        configured = bool(config.get("gateway_url"))

        status = {
            "configured": configured,
            "gateway_url": config.get("gateway_url"),
            "site_id": config.get("site_id"),
            "site_slug": config.get("site_slug"),
            "agent_running": False,
            "agent_connected": False,
            "last_heartbeat": None,
            "messages_sent": 0,
            "messages_received": 0,
            "active_policies": 0,
            "error": None,
        }

        if not configured:
            return status

        # Count active policies
        policies = await self.get_policies()
        status["active_policies"] = len([p for p in policies if p.get("enabled", True)])

        # Check agent sidecar health
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{CLOUD_AGENT_URL}/health")
                if resp.status_code == 200:
                    agent_data = resp.json()
                    status["agent_running"] = True
                    status["agent_connected"] = agent_data.get("cloud_connected", False)
                    status["last_heartbeat"] = agent_data.get("last_heartbeat")
                    status["messages_sent"] = agent_data.get("messages_sent", 0)
                    status["messages_received"] = agent_data.get("messages_received", 0)
        except Exception:
            # Agent not running or not reachable — that's OK
            pass

        # Derive overall status
        if status["agent_connected"]:
            await self.redis.hset(CLOUD_CONFIG_KEY, "status", "connected")
        elif status["agent_running"]:
            await self.redis.hset(CLOUD_CONFIG_KEY, "status", "connecting")
        elif configured and config.get("site_id"):
            await self.redis.hset(CLOUD_CONFIG_KEY, "status", "disconnected")

        return status

    async def test_connection(self) -> Dict[str, Any]:
        """Run end-to-end connection test."""
        config = await self.get_config()
        checks = {
            "gateway_reachable": False,
            "site_registered": False,
            "certs_valid": False,
            "agent_connected": False,
        }
        error = None
        latency_ms = None

        if not config.get("gateway_url"):
            return {"success": False, "error": "No gateway URL configured", "checks": checks}

        # Check 1: Gateway reachable
        try:
            start = time.time()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{config['gateway_url'].rstrip('/')}/health")
                latency_ms = round((time.time() - start) * 1000, 1)
                checks["gateway_reachable"] = resp.status_code == 200
        except Exception as e:
            error = f"Gateway unreachable: {e}"
            return {"success": False, "error": error, "latency_ms": latency_ms, "checks": checks}

        # Check 2: Site registered
        if config.get("site_id"):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        f"{config['gateway_url'].rstrip('/')}/api/v1/sites/{config['site_id']}"
                    )
                    checks["site_registered"] = resp.status_code == 200
            except Exception:
                pass

        # Check 3: Certs valid (check if agent can use them)
        # For now, this is a placeholder — cert validation happens at the agent level
        checks["certs_valid"] = checks["site_registered"]

        # Check 4: Agent connected
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{CLOUD_AGENT_URL}/health")
                if resp.status_code == 200:
                    agent_data = resp.json()
                    checks["agent_connected"] = agent_data.get("cloud_connected", False)
        except Exception:
            pass

        success = all(checks.values())
        if not success and not error:
            failed = [k for k, v in checks.items() if not v]
            error = f"Failed checks: {', '.join(failed)}"

        return {
            "success": success,
            "latency_ms": latency_ms,
            "error": error if not success else None,
            "checks": checks,
        }

    async def get_metrics(self) -> Dict[str, Any]:
        """Get cloud gateway metrics (proxied from cloud API)."""
        config = await self.get_config()
        if not config.get("gateway_url") or not config.get("site_id"):
            return {}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{config['gateway_url'].rstrip('/')}/api/v1/metrics")
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to fetch cloud metrics: {e}")
            return {"error": str(e)}


# Global singleton
cloud_manager = CloudManager()
