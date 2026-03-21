"""
Cloud Gateway API Router
Configuration, registration, policies, and status for cloud gateway integration.
"""

from fastapi import APIRouter, HTTPException
from typing import List

from models import (
    CloudConfig, CloudConfigUpdate, CloudSiteRegister,
    CloudPolicy, CloudPoliciesUpdate,
    CloudStatus, CloudTestResult,
)
from cloud_manager import cloud_manager

router = APIRouter(prefix="/cloud", tags=["cloud"])


# =============================================================================
# Configuration
# =============================================================================

@router.get("/config", response_model=CloudConfig)
async def get_cloud_config():
    """Get current cloud gateway configuration."""
    return await cloud_manager.get_config()


@router.put("/config", response_model=CloudConfig)
async def save_cloud_config(update: CloudConfigUpdate):
    """Save cloud gateway URL. First step in setup."""
    return await cloud_manager.save_config(gateway_url=update.gateway_url)


@router.delete("/config")
async def delete_cloud_config():
    """Disconnect from cloud gateway and clear all configuration."""
    await cloud_manager.clear_config()
    return {"status": "disconnected", "message": "Cloud gateway configuration removed"}


# =============================================================================
# Site Registration
# =============================================================================

@router.post("/register")
async def register_site(data: CloudSiteRegister):
    """Register this Maestra instance as a site with the cloud gateway."""
    try:
        result = await cloud_manager.register_site(
            gateway_url=data.gateway_url,
            name=data.name,
            slug=data.slug,
            description=data.description,
            region=data.region,
            tags=data.tags,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to register with cloud gateway: {e}")


@router.post("/activate")
async def activate_site():
    """Activate this site on the cloud gateway."""
    try:
        result = await cloud_manager.activate_site()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to activate site: {e}")


# =============================================================================
# Certificates
# =============================================================================

@router.post("/certificates/issue")
async def issue_certificates():
    """Request mTLS certificates from the cloud gateway CA."""
    try:
        result = await cloud_manager.issue_certificates()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to issue certificates: {e}")


# =============================================================================
# Policies
# =============================================================================

@router.get("/policies", response_model=List[CloudPolicy])
async def get_cloud_policies():
    """Get current cloud routing policies."""
    policies = await cloud_manager.get_policies()
    return [CloudPolicy(**p) for p in policies]


@router.put("/policies", response_model=List[CloudPolicy])
async def save_cloud_policies(update: CloudPoliciesUpdate):
    """Save cloud routing policies."""
    policies_dicts = [p.model_dump() for p in update.policies]
    saved = await cloud_manager.save_policies(policies_dicts)
    return [CloudPolicy(**p) for p in saved]


# =============================================================================
# Status & Testing
# =============================================================================

@router.get("/status", response_model=CloudStatus)
async def get_cloud_status():
    """Get full cloud gateway connection status including agent health."""
    return await cloud_manager.get_status()


@router.post("/test", response_model=CloudTestResult)
async def test_cloud_connection():
    """Run end-to-end cloud gateway connection test."""
    return await cloud_manager.test_connection()


# =============================================================================
# Metrics
# =============================================================================

@router.get("/metrics")
async def get_cloud_metrics():
    """Get cloud gateway metrics (proxied from cloud API)."""
    return await cloud_manager.get_metrics()
