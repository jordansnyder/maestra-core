"""
Database connection and SQLAlchemy models for Fleet Manager
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, Text, ARRAY, ForeignKey, text, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.types import TypeDecorator, UserDefinedType
from datetime import datetime
from uuid import uuid4
import os


# Custom LTREE type for PostgreSQL
class LtreeType(UserDefinedType):
    """PostgreSQL LTREE type for hierarchical labels"""
    cache_ok = True

    def get_col_spec(self):
        return "LTREE"

    def bind_processor(self, dialect):
        def process(value):
            return value
        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            return value
        return process

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
    type_metadata = Column('metadata', JSONB, default={})
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
    path = Column(LtreeType)  # PostgreSQL LTREE for hierarchical paths
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
# Routing Models
# =============================================================================

class RoutingDeviceDB(Base):
    """Routing device - signal chain equipment for visual patching"""
    __tablename__ = "routing_devices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    device_type = Column(String(100), nullable=False)
    icon = Column(String(50), default='📦')
    color = Column(String(20), default='#6C757D')
    inputs = Column(JSONB, nullable=False, default=[])
    outputs = Column(JSONB, nullable=False, default=[])
    routing_metadata = Column('metadata', JSONB, default={})
    position_x = Column(Float, default=0)
    position_y = Column(Float, default=0)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RouteDB(Base):
    """Signal route between device ports"""
    __tablename__ = "routes"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    from_device_id = Column(PGUUID(as_uuid=True), ForeignKey("routing_devices.id", ondelete="CASCADE"), nullable=False)
    from_port = Column(String(100), nullable=False)
    to_device_id = Column(PGUUID(as_uuid=True), ForeignKey("routing_devices.id", ondelete="CASCADE"), nullable=False)
    to_port = Column(String(100), nullable=False)
    preset_id = Column(PGUUID(as_uuid=True), ForeignKey("route_presets.id", ondelete="CASCADE"))
    route_metadata = Column('metadata', JSONB, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class RoutePresetDB(Base):
    """Named routing configuration snapshot"""
    __tablename__ = "route_presets"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    preset_metadata = Column('metadata', JSONB, default={})
    is_active = Column(Boolean, default=False)
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
