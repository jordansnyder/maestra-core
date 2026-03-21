"""
Maestra OFL Fixture Library Router

REST API for browsing the Open Fixture Library (OFL) fixture catalog
synced into the ofl_manufacturers and ofl_fixtures tables, and querying
the latest sync status from ofl_sync_log.
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import json

from database import get_db

router = APIRouter(prefix="/ofl", tags=["OFL Fixtures"])


# =============================================================================
# Pydantic Models
# =============================================================================

class OFLManufacturer(BaseModel):
    id: str
    key: str
    name: str
    website: Optional[str] = None
    fixture_count: Optional[int] = None
    synced_at: Optional[str] = None


class OFLChannelDef(BaseModel):
    name: str
    type: str
    defaultValue: Optional[float] = None


class OFLFixtureMode(BaseModel):
    shortName: str
    name: str
    channels: List[Dict[str, Any]]
    channel_count: int


class OFLFixture(BaseModel):
    id: str
    manufacturer_key: str
    fixture_key: str
    name: str
    source: str
    categories: List[str]
    channel_count_min: Optional[int] = None
    channel_count_max: Optional[int] = None
    physical: Dict[str, Any]
    modes: List[OFLFixtureMode]
    ofl_last_modified: Optional[str] = None
    synced_at: Optional[str] = None


class OFLFixtureList(BaseModel):
    items: List[OFLFixture]
    total: int
    page: int
    limit: int


class SyncStatus(BaseModel):
    ran_at: str
    ofl_commit_sha: Optional[str] = None
    ofl_schema_version: Optional[str] = None
    fixtures_added: int
    fixtures_updated: int
    fixtures_skipped: int
    fixtures_errored: int
    status: str
    errors: List[Any]


# =============================================================================
# Helpers
# =============================================================================

def _parse_modes(modes_raw) -> List[OFLFixtureMode]:
    """Parse modes JSONB value into OFLFixtureMode list."""
    if not modes_raw:
        return []
    if isinstance(modes_raw, str):
        try:
            modes_data = json.loads(modes_raw)
        except (json.JSONDecodeError, TypeError):
            return []
    else:
        modes_data = modes_raw

    result = []
    for m in modes_data:
        channels = m.get("channels", [])
        result.append(OFLFixtureMode(
            shortName=m.get("shortName", ""),
            name=m.get("name", ""),
            channels=channels,
            channel_count=m.get("channel_count", len(channels)),
        ))
    return result


def _parse_physical(physical_raw) -> Dict[str, Any]:
    if not physical_raw:
        return {}
    if isinstance(physical_raw, str):
        try:
            return json.loads(physical_raw)
        except (json.JSONDecodeError, TypeError):
            return {}
    return physical_raw if isinstance(physical_raw, dict) else {}


def _parse_errors(errors_raw) -> List[Any]:
    if not errors_raw:
        return []
    if isinstance(errors_raw, str):
        try:
            return json.loads(errors_raw)
        except (json.JSONDecodeError, TypeError):
            return []
    return errors_raw if isinstance(errors_raw, list) else []


def _row_to_manufacturer(row) -> OFLManufacturer:
    return OFLManufacturer(
        id=str(row.id),
        key=row.key,
        name=row.name,
        website=row.website,
        fixture_count=row.fixture_count if hasattr(row, "fixture_count") else None,
        synced_at=row.synced_at.isoformat() if row.synced_at else None,
    )


def _row_to_fixture(row) -> OFLFixture:
    categories = row.categories if row.categories else []
    return OFLFixture(
        id=str(row.id),
        manufacturer_key=row.manufacturer_key,
        fixture_key=row.fixture_key,
        name=row.name,
        source=row.source,
        categories=categories,
        channel_count_min=row.channel_count_min,
        channel_count_max=row.channel_count_max,
        physical=_parse_physical(row.physical),
        modes=_parse_modes(row.modes),
        ofl_last_modified=str(row.ofl_last_modified) if row.ofl_last_modified else None,
        synced_at=row.synced_at.isoformat() if row.synced_at else None,
    )


# =============================================================================
# Manufacturer Endpoints
# =============================================================================

@router.get("/manufacturers", response_model=List[OFLManufacturer])
async def list_manufacturers(
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List all OFL manufacturers with fixture counts.

    Optional query param:
    - q: partial match on manufacturer name
    """
    params: Dict[str, Any] = {}
    where_clauses = []

    if q:
        where_clauses.append("m.name ILIKE :q")
        params["q"] = f"%{q}%"

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    result = await db.execute(text(f"""
        SELECT
            m.id,
            m.key,
            m.name,
            m.website,
            m.synced_at,
            COUNT(f.id)::int AS fixture_count
        FROM ofl_manufacturers m
        LEFT JOIN ofl_fixtures f ON f.manufacturer_key = m.key
        {where}
        GROUP BY m.id, m.key, m.name, m.website, m.synced_at
        ORDER BY m.name ASC
    """), params)

    return [_row_to_manufacturer(r) for r in result.fetchall()]


# =============================================================================
# Fixture Endpoints
# =============================================================================

@router.get("/fixtures", response_model=OFLFixtureList)
async def list_fixtures(
    q: Optional[str] = None,
    manufacturer: Optional[str] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """
    List OFL fixtures with optional full-text search and filters.

    Query params:
    - q: full-text search (name, manufacturer, categories)
    - manufacturer: filter by manufacturer key
    - category: filter by category string (array contains)
    - source: filter by source ('ofl' or 'custom')
    - page: page number (1-based)
    - limit: results per page (default 50)
    """
    if page < 1:
        page = 1
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    offset = (page - 1) * limit
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    where_clauses = []

    if q:
        where_clauses.append("f.search_vector @@ plainto_tsquery('english', :q)")
        params["q"] = q

    if manufacturer:
        where_clauses.append("f.manufacturer_key = :manufacturer")
        params["manufacturer"] = manufacturer

    if category:
        where_clauses.append("f.categories @> ARRAY[:category]::text[]")
        params["category"] = category

    if source:
        where_clauses.append("f.source = :source::fixture_source")
        params["source"] = source

    where = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM ofl_fixtures f {where}"),
        params,
    )
    total = count_result.scalar() or 0

    result = await db.execute(text(f"""
        SELECT
            f.id, f.manufacturer_key, f.fixture_key, f.name, f.source,
            f.categories, f.channel_count_min, f.channel_count_max,
            f.physical, f.modes, f.ofl_last_modified, f.synced_at
        FROM ofl_fixtures f
        {where}
        ORDER BY f.manufacturer_key ASC, f.name ASC
        LIMIT :limit OFFSET :offset
    """), params)

    items = [_row_to_fixture(r) for r in result.fetchall()]

    return OFLFixtureList(
        items=items,
        total=int(total),
        page=page,
        limit=limit,
    )


@router.get("/fixtures/by-id/{fixture_id}", response_model=OFLFixture)
async def get_fixture_by_id(
    fixture_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single OFL fixture by its UUID, with full mode details."""
    result = await db.execute(text("""
        SELECT
            f.id, f.manufacturer_key, f.fixture_key, f.name, f.source,
            f.categories, f.channel_count_min, f.channel_count_max,
            f.physical, f.modes, f.ofl_last_modified, f.synced_at
        FROM ofl_fixtures f
        WHERE f.id = :id
        LIMIT 1
    """), {"id": fixture_id})

    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"OFL fixture with id '{fixture_id}' not found.",
        )
    return _row_to_fixture(row)


@router.get("/fixtures/{manufacturer_key}/{fixture_key}", response_model=OFLFixture)
async def get_fixture(
    manufacturer_key: str,
    fixture_key: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single OFL fixture by manufacturer key and fixture key, with full mode details."""
    result = await db.execute(text("""
        SELECT
            f.id, f.manufacturer_key, f.fixture_key, f.name, f.source,
            f.categories, f.channel_count_min, f.channel_count_max,
            f.physical, f.modes, f.ofl_last_modified, f.synced_at
        FROM ofl_fixtures f
        WHERE f.manufacturer_key = :manufacturer_key
          AND f.fixture_key = :fixture_key
        LIMIT 1
    """), {
        "manufacturer_key": manufacturer_key,
        "fixture_key": fixture_key,
    })

    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"OFL fixture '{manufacturer_key}/{fixture_key}' not found.",
        )
    return _row_to_fixture(row)


# =============================================================================
# Sync Status Endpoint
# =============================================================================

@router.get("/sync/status", response_model=SyncStatus)
async def get_sync_status(db: AsyncSession = Depends(get_db)):
    """Return the latest OFL sync log entry."""
    result = await db.execute(text("""
        SELECT
            ran_at, ofl_commit_sha, ofl_schema_version,
            fixtures_added, fixtures_updated, fixtures_skipped,
            fixtures_errored, errors, status
        FROM ofl_sync_log
        ORDER BY ran_at DESC
        LIMIT 1
    """))

    row = result.fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail="No OFL sync has been run yet. Run 'make sync-ofl' to sync the fixture library.",
        )

    return SyncStatus(
        ran_at=row.ran_at.isoformat(),
        ofl_commit_sha=row.ofl_commit_sha,
        ofl_schema_version=row.ofl_schema_version,
        fixtures_added=row.fixtures_added,
        fixtures_updated=row.fixtures_updated,
        fixtures_skipped=row.fixtures_skipped,
        fixtures_errored=row.fixtures_errored,
        status=row.status,
        errors=_parse_errors(row.errors),
    )
