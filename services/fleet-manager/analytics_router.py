"""
Analytics API Router
Show annotations, summaries, data export, and collection configuration
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
import json
import csv
import io
import logging

from database import get_db
from models import (
    ShowAnnotation, ShowAnnotationCreate, ShowAnnotationUpdate,
    ShowSummary,
    CollectionConfig, CollectionConfigCreate, CollectionConfigUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# =============================================================================
# VERBOSITY HELPER
# =============================================================================

async def get_verbosity_for_entity(
    db: AsyncSession,
    entity_type: str,
    device_id: Optional[UUID] = None
) -> str:
    """
    Resolve collection verbosity. Lookup order:
    1. Device-specific (scope_type='device', scope_id=str(device_id))
    2. Entity-type-specific (scope_type='entity_type', scope_id=entity_type)
    3. Global (scope_type='global', scope_id IS NULL)
    Defaults to 'standard' if nothing configured.
    """
    if device_id:
        r = await db.execute(text(
            "SELECT verbosity FROM collection_config "
            "WHERE scope_type = 'device' AND scope_id = :sid"
        ), {"sid": str(device_id)})
        row = r.fetchone()
        if row:
            return row.verbosity

    r = await db.execute(text(
        "SELECT verbosity FROM collection_config "
        "WHERE scope_type = 'entity_type' AND scope_id = :sid"
    ), {"sid": entity_type})
    row = r.fetchone()
    if row:
        return row.verbosity

    r = await db.execute(text(
        "SELECT verbosity FROM collection_config "
        "WHERE scope_type = 'global' AND scope_id IS NULL"
    ))
    row = r.fetchone()
    if row:
        return row.verbosity

    return "standard"


# =============================================================================
# SHOW ANNOTATIONS
# =============================================================================

@router.get("/annotations", response_model=List[ShowAnnotation])
async def list_annotations(
    category: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """List show annotations with optional filtering"""
    query = "SELECT * FROM show_annotations WHERE 1=1"
    params: Dict[str, Any] = {}

    if category:
        query += " AND category = :category"
        params["category"] = category
    if since:
        query += " AND time >= :since"
        params["since"] = since
    if until:
        query += " AND time <= :until"
        params["until"] = until

    query += " ORDER BY time DESC LIMIT :limit"
    params["limit"] = limit

    result = await db.execute(text(query), params)
    rows = result.fetchall()

    return [ShowAnnotation(
        id=r.id, time=r.time, title=r.title,
        description=r.description, category=r.category,
        tags=r.tags or [], metadata=r.metadata or {},
        created_at=r.created_at, updated_at=r.updated_at
    ) for r in rows]


@router.post("/annotations", response_model=ShowAnnotation, status_code=201)
async def create_annotation(
    annotation: ShowAnnotationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a show annotation (tag a moment like 'opening night', 'peak crowd')"""
    result = await db.execute(text("""
        INSERT INTO show_annotations (time, title, description, category, tags, metadata)
        VALUES (:time, :title, :description, :category, :tags, CAST(:metadata AS jsonb))
        RETURNING *
    """), {
        "time": annotation.time or datetime.utcnow(),
        "title": annotation.title,
        "description": annotation.description,
        "category": annotation.category or "general",
        "tags": annotation.tags or [],
        "metadata": json.dumps(annotation.metadata or {})
    })
    await db.commit()
    r = result.fetchone()

    return ShowAnnotation(
        id=r.id, time=r.time, title=r.title,
        description=r.description, category=r.category,
        tags=r.tags or [], metadata=r.metadata or {},
        created_at=r.created_at, updated_at=r.updated_at
    )


@router.put("/annotations/{annotation_id}", response_model=ShowAnnotation)
async def update_annotation(
    annotation_id: UUID,
    update: ShowAnnotationUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a show annotation"""
    # Build dynamic update
    sets = []
    params: Dict[str, Any] = {"id": annotation_id}

    if update.title is not None:
        sets.append("title = :title")
        params["title"] = update.title
    if update.description is not None:
        sets.append("description = :description")
        params["description"] = update.description
    if update.category is not None:
        sets.append("category = :category")
        params["category"] = update.category
    if update.tags is not None:
        sets.append("tags = :tags")
        params["tags"] = update.tags
    if update.metadata is not None:
        sets.append("metadata = CAST(:metadata AS jsonb)")
        params["metadata"] = json.dumps(update.metadata)

    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    query = f"UPDATE show_annotations SET {', '.join(sets)} WHERE id = :id RETURNING *"
    result = await db.execute(text(query), params)
    r = result.fetchone()

    if not r:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.commit()

    return ShowAnnotation(
        id=r.id, time=r.time, title=r.title,
        description=r.description, category=r.category,
        tags=r.tags or [], metadata=r.metadata or {},
        created_at=r.created_at, updated_at=r.updated_at
    )


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a show annotation"""
    result = await db.execute(
        text("DELETE FROM show_annotations WHERE id = :id RETURNING id"),
        {"id": annotation_id}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.commit()
    return {"status": "deleted", "id": str(annotation_id)}


# =============================================================================
# SHOW SUMMARY
# =============================================================================

@router.get("/summary", response_model=ShowSummary)
async def get_show_summary(
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregate show statistics for a presentation.
    Defaults to all-time if no range specified.
    """
    time_filter = ""
    params: Dict[str, Any] = {}

    if since:
        time_filter += " AND time >= :since"
        params["since"] = since
    if until:
        time_filter += " AND time <= :until"
        params["until"] = until

    # Total metrics
    r = await db.execute(text(
        f"SELECT COUNT(*) as cnt FROM device_metrics WHERE 1=1 {time_filter}"
    ), params)
    total_metrics = r.scalar() or 0

    # Total events
    r = await db.execute(text(
        f"SELECT COUNT(*) as cnt FROM device_events WHERE 1=1 {time_filter}"
    ), params)
    total_events = r.scalar() or 0

    # Total state changes
    r = await db.execute(text(
        f"SELECT COUNT(*) as cnt FROM entity_states WHERE 1=1 {time_filter}"
    ), params)
    total_state_changes = r.scalar() or 0

    # Unique devices that sent metrics
    r = await db.execute(text(
        f"SELECT COUNT(DISTINCT device_id) as cnt FROM device_metrics WHERE 1=1 {time_filter}"
    ), params)
    unique_devices = r.scalar() or 0

    # Unique entities with state changes
    r = await db.execute(text(
        f"SELECT COUNT(DISTINCT entity_id) as cnt FROM entity_states WHERE 1=1 {time_filter}"
    ), params)
    unique_entities = r.scalar() or 0

    # Date range of data
    r = await db.execute(text(
        f"SELECT MIN(time) as first_ts, MAX(time) as last_ts FROM device_events WHERE 1=1 {time_filter}"
    ), params)
    row = r.fetchone()
    first_event = row.first_ts if row else None
    last_event = row.last_ts if row else None

    # Online devices right now
    r = await db.execute(text(
        "SELECT COUNT(*) as cnt FROM devices WHERE status = 'online'"
    ))
    online_devices = r.scalar() or 0

    # Total registered devices
    r = await db.execute(text("SELECT COUNT(*) as cnt FROM devices"))
    total_devices = r.scalar() or 0

    # Top 5 most active entities by state change count
    r = await db.execute(text(f"""
        SELECT entity_slug, entity_type, COUNT(*) as changes
        FROM entity_states WHERE 1=1 {time_filter}
        GROUP BY entity_slug, entity_type
        ORDER BY changes DESC LIMIT 5
    """), params)
    top_entities = [
        {"slug": row.entity_slug, "type": row.entity_type, "changes": row.changes}
        for row in r.fetchall()
    ]

    # Events by severity
    r = await db.execute(text(f"""
        SELECT severity, COUNT(*) as cnt
        FROM device_events WHERE 1=1 {time_filter}
        GROUP BY severity
    """), params)
    events_by_severity = {row.severity: row.cnt for row in r.fetchall()}

    # Annotations count
    ann_filter = time_filter  # same time params work for annotations
    r = await db.execute(text(
        f"SELECT COUNT(*) as cnt FROM show_annotations WHERE 1=1 {ann_filter}"
    ), params)
    annotations_count = r.scalar() or 0

    return ShowSummary(
        total_metrics=total_metrics,
        total_events=total_events,
        total_state_changes=total_state_changes,
        unique_devices=unique_devices,
        unique_entities=unique_entities,
        total_devices_registered=total_devices,
        devices_online=online_devices,
        first_event_at=first_event,
        last_event_at=last_event,
        top_entities=top_entities,
        events_by_severity=events_by_severity,
        annotations_count=annotations_count
    )


# =============================================================================
# DATA EXPORT
# =============================================================================

@router.get("/export/{data_type}")
async def export_data(
    data_type: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    entity_slug: Optional[str] = None,
    device_id: Optional[UUID] = None,
    limit: int = Query(10000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db)
):
    """
    Export metrics, events, or state history as JSON or CSV.
    Use for building presentation visuals from show data.
    """
    params: Dict[str, Any] = {"limit": limit}

    if data_type == "metrics":
        query = "SELECT time, device_id, metric_name, metric_value, unit, tags FROM device_metrics WHERE 1=1"
        if since:
            query += " AND time >= :since"; params["since"] = since
        if until:
            query += " AND time <= :until"; params["until"] = until
        if device_id:
            query += " AND device_id = :device_id"; params["device_id"] = device_id
        query += " ORDER BY time DESC LIMIT :limit"

    elif data_type == "events":
        query = "SELECT time, device_id, event_type, severity, message, data FROM device_events WHERE 1=1"
        if since:
            query += " AND time >= :since"; params["since"] = since
        if until:
            query += " AND time <= :until"; params["until"] = until
        if device_id:
            query += " AND device_id = :device_id"; params["device_id"] = device_id
        query += " ORDER BY time DESC LIMIT :limit"

    elif data_type == "states":
        query = ("SELECT time, entity_id, entity_slug, entity_type, entity_path, "
                 "state, previous_state, changed_keys, source FROM entity_states WHERE 1=1")
        if since:
            query += " AND time >= :since"; params["since"] = since
        if until:
            query += " AND time <= :until"; params["until"] = until
        if entity_slug:
            query += " AND entity_slug = :entity_slug"; params["entity_slug"] = entity_slug
        query += " ORDER BY time DESC LIMIT :limit"

    elif data_type == "annotations":
        query = "SELECT id, time, title, description, category, tags, metadata FROM show_annotations WHERE 1=1"
        if since:
            query += " AND time >= :since"; params["since"] = since
        if until:
            query += " AND time <= :until"; params["until"] = until
        query += " ORDER BY time DESC LIMIT :limit"

    else:
        raise HTTPException(
            status_code=400,
            detail="data_type must be one of: metrics, events, states, annotations"
        )

    result = await db.execute(text(query), params)
    rows = result.fetchall()
    columns = list(result.keys())

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([
                json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                for v in row
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={data_type}_export.csv"
            }
        )
    else:
        data = []
        for row in rows:
            d = {}
            for col, val in zip(columns, row):
                if isinstance(val, datetime):
                    d[col] = val.isoformat()
                elif isinstance(val, UUID):
                    d[col] = str(val)
                else:
                    d[col] = val
            data.append(d)
        return data


# =============================================================================
# COLLECTION VERBOSITY CONFIGURATION
# =============================================================================

@router.get("/config", response_model=List[CollectionConfig])
async def list_collection_configs(db: AsyncSession = Depends(get_db)):
    """List all collection verbosity configurations"""
    result = await db.execute(text(
        "SELECT * FROM collection_config ORDER BY scope_type, scope_id"
    ))
    rows = result.fetchall()
    return [CollectionConfig(
        id=r.id, scope_type=r.scope_type, scope_id=r.scope_id,
        verbosity=r.verbosity, config=r.config or {},
        created_at=r.created_at, updated_at=r.updated_at
    ) for r in rows]


@router.put("/config", response_model=CollectionConfig)
async def set_collection_config(
    config: CollectionConfigCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Set collection verbosity for a scope (upserts).
    Scope types: 'global', 'entity_type', 'device'.
    Verbosity levels: 'minimal', 'standard', 'verbose'.
    """
    if config.verbosity not in ("minimal", "standard", "verbose"):
        raise HTTPException(
            status_code=400,
            detail="verbosity must be one of: minimal, standard, verbose"
        )
    if config.scope_type not in ("global", "entity_type", "device"):
        raise HTTPException(
            status_code=400,
            detail="scope_type must be one of: global, entity_type, device"
        )

    result = await db.execute(text("""
        INSERT INTO collection_config (scope_type, scope_id, verbosity, config)
        VALUES (:scope_type, :scope_id, :verbosity, CAST(:config AS jsonb))
        ON CONFLICT (scope_type, scope_id)
        DO UPDATE SET verbosity = :verbosity, config = CAST(:config AS jsonb)
        RETURNING *
    """), {
        "scope_type": config.scope_type,
        "scope_id": config.scope_id,
        "verbosity": config.verbosity,
        "config": json.dumps(config.config or {})
    })
    await db.commit()
    r = result.fetchone()

    return CollectionConfig(
        id=r.id, scope_type=r.scope_type, scope_id=r.scope_id,
        verbosity=r.verbosity, config=r.config or {},
        created_at=r.created_at, updated_at=r.updated_at
    )


@router.delete("/config/{config_id}")
async def delete_collection_config(
    config_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete a collection config entry"""
    result = await db.execute(
        text("DELETE FROM collection_config WHERE id = :id RETURNING id"),
        {"id": config_id}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Config not found")
    await db.commit()
    return {"status": "deleted", "id": str(config_id)}
