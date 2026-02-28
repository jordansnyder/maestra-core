"""
Stream API Router
Stream discovery, advertisement, negotiation, and session management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from database import get_db, StreamTypeDB, async_session_maker
from models import (
    StreamAdvertise, StreamInfo, StreamRequest, StreamOffer,
    StreamSession, StreamSessionHistory, StreamTypeInfo, StreamTypeCreate,
    StreamRegistryState,
)
from stream_manager import stream_manager

router = APIRouter(prefix="/streams", tags=["streams"])


# =============================================================================
# Helpers
# =============================================================================

def stream_type_db_to_response(db_type: StreamTypeDB) -> StreamTypeInfo:
    """Convert database model to response model"""
    return StreamTypeInfo(
        id=db_type.id,
        name=db_type.name,
        display_name=db_type.display_name,
        description=db_type.description,
        icon=db_type.icon,
        default_config=db_type.default_config or {},
        metadata=db_type.stream_type_metadata or {},
        created_at=db_type.created_at or datetime.utcnow(),
        updated_at=db_type.updated_at or datetime.utcnow(),
    )


# =============================================================================
# Full State Endpoint (single fetch for dashboard)
# =============================================================================

@router.get("/state", response_model=StreamRegistryState)
async def get_stream_state(db: AsyncSession = Depends(get_db)):
    """Get complete stream state: all streams, sessions, and types"""
    # Stream types from Postgres
    result = await db.execute(
        select(StreamTypeDB).order_by(StreamTypeDB.name)
    )
    stream_types = [stream_type_db_to_response(t) for t in result.scalars().all()]

    # Active streams from Redis
    streams_data = await stream_manager.list_streams()
    streams = [StreamInfo(**s) for s in streams_data]

    # Active sessions from Redis
    sessions_data = await stream_manager.list_sessions()
    sessions = [StreamSession(**s) for s in sessions_data]

    return StreamRegistryState(
        streams=streams,
        sessions=sessions,
        stream_types=stream_types,
    )


# =============================================================================
# Stream Type CRUD
# =============================================================================

@router.get("/types", response_model=List[StreamTypeInfo])
async def list_stream_types(db: AsyncSession = Depends(get_db)):
    """List all stream type definitions"""
    result = await db.execute(
        select(StreamTypeDB).order_by(StreamTypeDB.name)
    )
    return [stream_type_db_to_response(t) for t in result.scalars().all()]


@router.post("/types", response_model=StreamTypeInfo, status_code=201)
async def create_stream_type(
    stream_type: StreamTypeCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a custom stream type"""
    # Check uniqueness
    result = await db.execute(
        select(StreamTypeDB).where(StreamTypeDB.name == stream_type.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Stream type '{stream_type.name}' already exists",
        )

    db_type = StreamTypeDB(
        name=stream_type.name,
        display_name=stream_type.display_name,
        description=stream_type.description,
        icon=stream_type.icon,
        default_config=stream_type.default_config,
        stream_type_metadata=stream_type.metadata,
    )
    db.add(db_type)
    await db.commit()
    await db.refresh(db_type)
    return stream_type_db_to_response(db_type)


# =============================================================================
# Stream Advertisement & Discovery
# =============================================================================

@router.get("", response_model=List[StreamInfo])
async def list_streams(
    stream_type: Optional[str] = Query(None, description="Filter by stream type"),
):
    """List active streams from the registry"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    streams_data = await stream_manager.list_streams(stream_type=stream_type)
    return [StreamInfo(**s) for s in streams_data]


@router.post("/advertise", response_model=StreamInfo, status_code=201)
async def advertise_stream(advert: StreamAdvertise):
    """Advertise a new stream"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    stream_data = await stream_manager.advertise_stream(advert.model_dump())
    return StreamInfo(**stream_data)


# =============================================================================
# Session Management
# =============================================================================
# NOTE: Session routes use /sessions/* prefix and MUST be defined before the
# catch-all /{stream_id} route, otherwise FastAPI would try to parse "sessions"
# as a UUID path parameter.

@router.get("/sessions", response_model=List[StreamSession])
async def list_sessions(
    stream_id: Optional[UUID] = Query(None, description="Filter by stream"),
):
    """List active sessions"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    sessions_data = await stream_manager.list_sessions(
        stream_id=str(stream_id) if stream_id else None
    )
    return [StreamSession(**s) for s in sessions_data]


@router.get("/sessions/history", response_model=List[StreamSessionHistory])
async def get_session_history(
    stream_id: Optional[UUID] = Query(None),
    publisher_id: Optional[str] = Query(None),
    consumer_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Query historical session records from Postgres"""
    query = "SELECT * FROM stream_sessions WHERE 1=1"
    params = {}

    if stream_id:
        query += " AND stream_id = :stream_id"
        params["stream_id"] = str(stream_id)
    if publisher_id:
        query += " AND publisher_id = :publisher_id"
        params["publisher_id"] = publisher_id
    if consumer_id:
        query += " AND consumer_id = :consumer_id"
        params["consumer_id"] = consumer_id

    query += " ORDER BY time DESC LIMIT :limit"
    params["limit"] = limit

    result = await db.execute(text(query), params)
    rows = result.mappings().all()

    return [
        StreamSessionHistory(
            time=row["time"],
            session_id=row["session_id"],
            stream_id=row["stream_id"],
            stream_name=row["stream_name"],
            stream_type=row["stream_type"],
            publisher_id=row["publisher_id"],
            consumer_id=row["consumer_id"],
            protocol=row["protocol"],
            status=row["status"],
            duration_seconds=row.get("duration_seconds"),
            bytes_transferred=row.get("bytes_transferred", 0),
            error_message=row.get("error_message"),
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}")
async def stop_session(session_id: UUID):
    """Stop an active session"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    db_session = async_session_maker()
    stopped = await stream_manager.stop_session(
        str(session_id), db_session=db_session
    )
    if not stopped:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    return {"status": "stopped", "session_id": str(session_id)}


@router.post("/sessions/{session_id}/heartbeat")
async def session_heartbeat(session_id: UUID):
    """Refresh a session's TTL"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    refreshed = await stream_manager.refresh_session_ttl(str(session_id))
    if not refreshed:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    return {"status": "ok", "session_id": str(session_id)}


# =============================================================================
# Single Stream by ID (catch-all — MUST be after all static /streams/* routes)
# =============================================================================

@router.get("/{stream_id}", response_model=StreamInfo)
async def get_stream(stream_id: UUID):
    """Get a single stream by ID"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    stream_data = await stream_manager.get_stream(str(stream_id))
    if not stream_data:
        raise HTTPException(status_code=404, detail="Stream not found or expired")

    return StreamInfo(**stream_data)


@router.delete("/{stream_id}")
async def withdraw_stream(stream_id: UUID):
    """Withdraw a stream from the registry"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    removed = await stream_manager.withdraw_stream(str(stream_id))
    if not removed:
        raise HTTPException(status_code=404, detail="Stream not found or expired")

    return {"status": "withdrawn", "stream_id": str(stream_id)}


@router.post("/{stream_id}/heartbeat")
async def stream_heartbeat(stream_id: UUID):
    """Refresh a stream's TTL"""
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    refreshed = await stream_manager.refresh_stream_ttl(str(stream_id))
    if not refreshed:
        raise HTTPException(status_code=404, detail="Stream not found or expired")

    return {"status": "ok", "stream_id": str(stream_id)}


# =============================================================================
# Stream Negotiation
# =============================================================================

@router.post("/{stream_id}/request", response_model=StreamOffer)
async def request_stream(stream_id: UUID, req: StreamRequest):
    """
    Request to consume a stream. Triggers NATS request-reply to the publisher.
    Returns connection details on success.
    """
    if not stream_manager.is_connected:
        raise HTTPException(status_code=503, detail="Stream manager not connected")

    # Get a fresh DB session for logging (fire-and-forget)
    db_session = async_session_maker()

    try:
        offer = await stream_manager.request_stream(
            stream_id=str(stream_id),
            consumer_id=req.consumer_id,
            consumer_address=req.consumer_address,
            consumer_port=req.consumer_port,
            config=req.config,
            db_session=db_session,
        )
        return StreamOffer(**offer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
