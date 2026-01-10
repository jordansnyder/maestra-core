"""
Database connection and SQLAlchemy models for Fleet Manager
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, Text, ARRAY, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from datetime import datetime
from uuid import uuid4
import os

# Database URL from environment
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://maestra:maestra_dev_password@postgres:5432/maestra'
)

# Convert to async driver
if DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://', 1)

# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


# =============================================================================
# SQLAlchemy Models
# =============================================================================

class EntityTypeDB(Base):
    """Entity type registry"""
    __tablename__ = "entity_types"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text)
    icon = Column(String(50))
    state_schema = Column(JSONB)
    default_state = Column(JSONB, default={})
    metadata = Column('metadata', JSONB, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EntityDB(Base):
    """Main entity table"""
    __tablename__ = "entities"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    entity_type_id = Column(PGUUID(as_uuid=True), ForeignKey("entity_types.id"), nullable=False)
    parent_id = Column(PGUUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"))
    path = Column(String)  # LTREE stored as string, converted by PostgreSQL
    state = Column(JSONB, default={})
    state_updated_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default='active')
    description = Column(Text)
    tags = Column(ARRAY(Text), default=[])
    entity_metadata = Column('metadata', JSONB, default={})
    device_id = Column(PGUUID(as_uuid=True), ForeignKey("devices.id", ondelete="SET NULL"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DeviceDB(Base):
    """Device registry"""
    __tablename__ = "devices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    device_type = Column(String(100), nullable=False)
    hardware_id = Column(String(255), unique=True, nullable=False)
    firmware_version = Column(String(50))
    ip_address = Column(String(50))  # Store as string for simplicity
    location = Column(JSONB)
    device_metadata = Column('metadata', JSONB)
    status = Column(String(50), default='offline')
    last_seen = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# Database Dependency
# =============================================================================

async def get_db():
    """Dependency to get database session"""
    async with async_session_maker() as session:
        yield session


async def init_db():
    """Initialize database connection"""
    try:
        async with engine.begin() as conn:
            # Test connection
            await conn.execute(text("SELECT 1"))
        print("✅ Database connection established")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


async def close_db():
    """Close database connections"""
    await engine.dispose()
    print("📴 Database connections closed")
