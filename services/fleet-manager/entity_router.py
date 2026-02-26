"""
Entity Management API Router
CRUD operations for entities, hierarchy queries, and state management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, text
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
import re
import json
import logging

from database import get_db, EntityDB, EntityTypeDB
from models import (
    Entity, EntityCreate, EntityUpdate,
    EntityType, EntityTypeCreate, EntityTypeUpdate,
    StateUpdate, StateSet, StateResponse,
    EntityTreeNode,
    VariableDefinition, VariableDefinitionCreate, VariableDefinitionUpdate,
    EntityVariables, EntityVariablesResponse,
    ValidationWarning, StateValidationResult
)
from state_manager import state_manager
from analytics_router import get_verbosity_for_entity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/entities", tags=["entities"])


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def generate_slug(name: str) -> str:
    """Generate URL-safe slug from name"""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug


async def record_state_change(
    db: AsyncSession,
    entity_id: UUID,
    entity_slug: str,
    entity_type: str,
    entity_path: Optional[str],
    previous_state: Dict[str, Any],
    new_state: Dict[str, Any],
    source: Optional[str] = None,
    device_id: Optional[UUID] = None
):
    """
    Insert a row into entity_states hypertable for historical tracking.
    Respects verbosity configuration:
      - minimal: skip recording entirely
      - standard: record state snapshot (empty previous_state to save space)
      - verbose: record full state + previous_state snapshot
    Non-fatal: failures are logged but don't break the state update flow.
    """
    changed_keys = state_manager.compute_changed_keys(previous_state, new_state)
    if not changed_keys:
        return

    try:
        verbosity = await get_verbosity_for_entity(db, entity_type, device_id)

        if verbosity == "minimal":
            return  # Skip state history recording

        prev_to_store = previous_state if verbosity == "verbose" else {}

        await db.execute(text("""
            INSERT INTO entity_states
                (time, entity_id, entity_slug, entity_type, entity_path,
                 state, previous_state, changed_keys, source)
            VALUES
                (NOW(), :entity_id, :entity_slug, :entity_type, :entity_path,
                 CAST(:state AS jsonb), CAST(:previous_state AS jsonb), :changed_keys, :source)
        """), {
            "entity_id": entity_id,
            "entity_slug": entity_slug,
            "entity_type": entity_type,
            "entity_path": entity_path,
            "state": json.dumps(new_state),
            "previous_state": json.dumps(prev_to_store),
            "changed_keys": changed_keys,
            "source": source
        })
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to record state history for {entity_slug}: {e}")


def entity_db_to_response(db_entity: EntityDB, entity_type: EntityTypeDB = None) -> Entity:
    """Convert database model to response model"""
    return Entity(
        id=db_entity.id,
        name=db_entity.name,
        slug=db_entity.slug,
        entity_type_id=db_entity.entity_type_id,
        parent_id=db_entity.parent_id,
        path=db_entity.path,
        state=db_entity.state or {},
        state_updated_at=db_entity.state_updated_at or datetime.utcnow(),
        status=db_entity.status or 'active',
        description=db_entity.description,
        tags=db_entity.tags or [],
        metadata=db_entity.entity_metadata or {},
        device_id=db_entity.device_id,
        created_at=db_entity.created_at or datetime.utcnow(),
        updated_at=db_entity.updated_at or datetime.utcnow(),
        entity_type=EntityType(
            id=entity_type.id,
            name=entity_type.name,
            display_name=entity_type.display_name,
            description=entity_type.description,
            icon=entity_type.icon,
            state_schema=entity_type.state_schema,
            default_state=entity_type.default_state or {},
            metadata=entity_type.type_metadata or {},
            created_at=entity_type.created_at,
            updated_at=entity_type.updated_at
        ) if entity_type else None
    )


def entity_type_db_to_response(db_type: EntityTypeDB) -> EntityType:
    """Convert entity type database model to response model"""
    return EntityType(
        id=db_type.id,
        name=db_type.name,
        display_name=db_type.display_name,
        description=db_type.description,
        icon=db_type.icon,
        state_schema=db_type.state_schema,
        default_state=db_type.default_state or {},
        metadata=db_type.type_metadata or {},
        created_at=db_type.created_at or datetime.utcnow(),
        updated_at=db_type.updated_at or datetime.utcnow()
    )


# =============================================================================
# ENTITY TYPE ENDPOINTS
# =============================================================================

@router.get("/types", response_model=List[EntityType])
async def list_entity_types(db: AsyncSession = Depends(get_db)):
    """List all available entity types"""
    result = await db.execute(select(EntityTypeDB).order_by(EntityTypeDB.name))
    types = result.scalars().all()
    return [entity_type_db_to_response(t) for t in types]


@router.post("/types", response_model=EntityType, status_code=201)
async def create_entity_type(
    entity_type: EntityTypeCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new entity type"""
    # Check for duplicate name
    result = await db.execute(
        select(EntityTypeDB).where(EntityTypeDB.name == entity_type.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Entity type '{entity_type.name}' already exists")

    db_type = EntityTypeDB(
        name=entity_type.name,
        display_name=entity_type.display_name,
        description=entity_type.description,
        icon=entity_type.icon,
        state_schema=entity_type.state_schema,
        default_state=entity_type.default_state,
        metadata=entity_type.metadata
    )

    db.add(db_type)
    await db.commit()
    await db.refresh(db_type)

    return entity_type_db_to_response(db_type)


@router.get("/types/{type_id}", response_model=EntityType)
async def get_entity_type(type_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get entity type by ID"""
    result = await db.execute(select(EntityTypeDB).where(EntityTypeDB.id == type_id))
    db_type = result.scalar_one_or_none()

    if not db_type:
        raise HTTPException(status_code=404, detail="Entity type not found")

    return entity_type_db_to_response(db_type)


@router.get("/types/by-name/{name}", response_model=EntityType)
async def get_entity_type_by_name(name: str, db: AsyncSession = Depends(get_db)):
    """Get entity type by name"""
    result = await db.execute(select(EntityTypeDB).where(EntityTypeDB.name == name))
    db_type = result.scalar_one_or_none()

    if not db_type:
        raise HTTPException(status_code=404, detail=f"Entity type '{name}' not found")

    return entity_type_db_to_response(db_type)


@router.put("/types/{type_id}", response_model=EntityType)
async def update_entity_type(
    type_id: UUID,
    update: EntityTypeUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an entity type"""
    result = await db.execute(select(EntityTypeDB).where(EntityTypeDB.id == type_id))
    db_type = result.scalar_one_or_none()

    if not db_type:
        raise HTTPException(status_code=404, detail="Entity type not found")

    # Apply updates
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_type, field, value)

    await db.commit()
    await db.refresh(db_type)

    return entity_type_db_to_response(db_type)


@router.delete("/types/{type_id}")
async def delete_entity_type(type_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete an entity type (fails if entities of this type exist)"""
    # Check if any entities use this type
    result = await db.execute(
        select(func.count(EntityDB.id)).where(EntityDB.entity_type_id == type_id)
    )
    count = result.scalar()

    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete entity type: {count} entities are using this type"
        )

    result = await db.execute(select(EntityTypeDB).where(EntityTypeDB.id == type_id))
    db_type = result.scalar_one_or_none()

    if not db_type:
        raise HTTPException(status_code=404, detail="Entity type not found")

    await db.execute(delete(EntityTypeDB).where(EntityTypeDB.id == type_id))
    await db.commit()

    return {"status": "deleted", "type_id": str(type_id)}


# =============================================================================
# ENTITY CRUD ENDPOINTS
# =============================================================================

@router.get("", response_model=List[Entity])
async def list_entities(
    entity_type: Optional[str] = Query(None, description="Filter by type name"),
    parent_id: Optional[UUID] = Query(None, description="Filter by parent ID"),
    root_only: bool = Query(False, description="Only return root entities (no parent)"),
    status: Optional[str] = Query(None, description="Filter by status"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    search: Optional[str] = Query(None, description="Search in name, slug, description"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List entities with filtering"""
    query = select(EntityDB, EntityTypeDB).join(
        EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id
    )

    # Apply filters
    if entity_type:
        query = query.where(EntityTypeDB.name == entity_type)

    if root_only:
        query = query.where(EntityDB.parent_id.is_(None))
    elif parent_id:
        query = query.where(EntityDB.parent_id == parent_id)

    if status:
        query = query.where(EntityDB.status == status)

    if tags:
        # Match entities that have ALL specified tags
        query = query.where(EntityDB.tags.contains(tags))

    if search:
        search_filter = f"%{search}%"
        query = query.where(
            (EntityDB.name.ilike(search_filter)) |
            (EntityDB.slug.ilike(search_filter)) |
            (EntityDB.description.ilike(search_filter))
        )

    query = query.order_by(EntityDB.name).limit(limit).offset(offset)

    result = await db.execute(query)
    rows = result.all()

    return [entity_db_to_response(e, t) for e, t in rows]


@router.post("", response_model=Entity, status_code=201)
async def create_entity(
    entity: EntityCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new entity"""
    # Verify entity type exists
    result = await db.execute(
        select(EntityTypeDB).where(EntityTypeDB.id == entity.entity_type_id)
    )
    entity_type = result.scalar_one_or_none()

    if not entity_type:
        raise HTTPException(status_code=404, detail="Entity type not found")

    # Verify parent exists if specified
    if entity.parent_id:
        result = await db.execute(
            select(EntityDB).where(EntityDB.id == entity.parent_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent entity not found")

    # Generate slug if not provided
    slug = entity.slug or generate_slug(entity.name)

    # Check for duplicate slug
    result = await db.execute(select(EntityDB).where(EntityDB.slug == slug))
    if result.scalar_one_or_none():
        # Append random suffix
        import secrets
        slug = f"{slug}-{secrets.token_hex(3)}"

    # Merge default state with provided state
    initial_state = {**(entity_type.default_state or {}), **(entity.state or {})}

    db_entity = EntityDB(
        name=entity.name,
        slug=slug,
        entity_type_id=entity.entity_type_id,
        parent_id=entity.parent_id,
        state=initial_state,
        description=entity.description,
        tags=entity.tags,
        entity_metadata=entity.metadata,
        device_id=entity.device_id,
        status='active'
    )

    db.add(db_entity)
    await db.commit()
    await db.refresh(db_entity)

    response = entity_db_to_response(db_entity, entity_type)

    # Broadcast lifecycle event
    await state_manager.broadcast_entity_lifecycle(
        "created",
        db_entity.id,
        db_entity.slug,
        entity_type.name,
        {"state": initial_state}
    )

    return response


@router.get("/tree", response_model=List[EntityTreeNode])
async def get_entity_tree(
    root_id: Optional[UUID] = Query(None, description="Start from specific entity"),
    entity_type: Optional[str] = Query(None, description="Filter by type"),
    max_depth: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db)
):
    """Get entity tree structure with nested children"""
    # Build base query for root entities
    if root_id:
        query = select(EntityDB, EntityTypeDB).join(
            EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id
        ).where(EntityDB.id == root_id)
    else:
        query = select(EntityDB, EntityTypeDB).join(
            EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id
        ).where(EntityDB.parent_id.is_(None))

    if entity_type:
        query = query.where(EntityTypeDB.name == entity_type)

    query = query.order_by(EntityDB.name)

    result = await db.execute(query)
    root_entities = result.all()

    async def build_tree(entity_id: UUID, current_depth: int) -> List[EntityTreeNode]:
        if current_depth >= max_depth:
            return []

        result = await db.execute(
            select(EntityDB, EntityTypeDB)
            .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
            .where(EntityDB.parent_id == entity_id)
            .order_by(EntityDB.name)
        )
        children_rows = result.all()

        nodes = []
        for db_entity, entity_type in children_rows:
            children = await build_tree(db_entity.id, current_depth + 1)
            nodes.append(EntityTreeNode(
                id=db_entity.id,
                name=db_entity.name,
                slug=db_entity.slug,
                entity_type_id=db_entity.entity_type_id,
                entity_type_name=entity_type.name,
                status=db_entity.status or 'active',
                state=db_entity.state or {},
                children=children
            ))
        return nodes

    tree = []
    for db_entity, entity_type in root_entities:
        children = await build_tree(db_entity.id, 1)
        tree.append(EntityTreeNode(
            id=db_entity.id,
            name=db_entity.name,
            slug=db_entity.slug,
            entity_type_id=db_entity.entity_type_id,
            entity_type_name=entity_type.name,
            status=db_entity.status or 'active',
            state=db_entity.state or {},
            children=children
        ))

    return tree


# =============================================================================
# VARIABLE DEFINITION ENDPOINTS
# =============================================================================

@router.get("/{entity_id}/variables", response_model=EntityVariablesResponse)
async def get_entity_variables(
    entity_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get all variable definitions for an entity"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    metadata = db_entity.entity_metadata or {}
    variables_data = metadata.get("variables", {"inputs": [], "outputs": []})

    return EntityVariablesResponse(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        variables=EntityVariables(
            inputs=[VariableDefinition(**v) for v in variables_data.get("inputs", [])],
            outputs=[VariableDefinition(**v) for v in variables_data.get("outputs", [])]
        )
    )


@router.put("/{entity_id}/variables", response_model=EntityVariablesResponse)
async def set_entity_variables(
    entity_id: UUID,
    variables: EntityVariables,
    db: AsyncSession = Depends(get_db)
):
    """Replace all variable definitions for an entity"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    # Update metadata with new variables
    metadata = db_entity.entity_metadata or {}
    metadata["variables"] = {
        "inputs": [v.model_dump() for v in variables.inputs],
        "outputs": [v.model_dump() for v in variables.outputs]
    }
    db_entity.entity_metadata = metadata
    db_entity.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_entity)

    return EntityVariablesResponse(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        variables=variables
    )


@router.post("/{entity_id}/variables", response_model=VariableDefinition, status_code=201)
async def add_variable(
    entity_id: UUID,
    variable: VariableDefinitionCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add a single variable definition to an entity"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    metadata = db_entity.entity_metadata or {}
    variables_data = metadata.get("variables", {"inputs": [], "outputs": []})

    # Check if variable with same name already exists
    all_names = [v["name"] for v in variables_data.get("inputs", [])] + \
                [v["name"] for v in variables_data.get("outputs", [])]
    if variable.name in all_names:
        raise HTTPException(status_code=400, detail=f"Variable '{variable.name}' already exists")

    # Create the variable definition
    var_def = VariableDefinition(
        name=variable.name,
        type=variable.type,
        direction=variable.direction,
        description=variable.description,
        defaultValue=variable.defaultValue,
        required=variable.required,
        config=variable.config or {}
    )

    # Add to appropriate list
    target_list = "inputs" if variable.direction == "input" else "outputs"
    if target_list not in variables_data:
        variables_data[target_list] = []
    variables_data[target_list].append(var_def.model_dump())

    metadata["variables"] = variables_data
    db_entity.entity_metadata = metadata
    db_entity.updated_at = datetime.utcnow()

    await db.commit()

    return var_def


@router.put("/{entity_id}/variables/{variable_name}", response_model=VariableDefinition)
async def update_variable(
    entity_id: UUID,
    variable_name: str,
    update: VariableDefinitionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a specific variable definition"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    metadata = db_entity.entity_metadata or {}
    variables_data = metadata.get("variables", {"inputs": [], "outputs": []})

    # Find the variable
    found = False
    updated_var = None
    for list_name in ["inputs", "outputs"]:
        for i, v in enumerate(variables_data.get(list_name, [])):
            if v["name"] == variable_name:
                # Apply updates
                if update.type is not None:
                    v["type"] = update.type
                if update.direction is not None:
                    v["direction"] = update.direction
                if update.description is not None:
                    v["description"] = update.description
                if update.defaultValue is not None:
                    v["defaultValue"] = update.defaultValue
                if update.required is not None:
                    v["required"] = update.required
                if update.config is not None:
                    v["config"] = update.config

                # If direction changed, move to other list
                new_direction = v.get("direction", "input")
                expected_list = "inputs" if new_direction == "input" else "outputs"
                if list_name != expected_list:
                    variables_data[list_name].pop(i)
                    if expected_list not in variables_data:
                        variables_data[expected_list] = []
                    variables_data[expected_list].append(v)

                updated_var = VariableDefinition(**v)
                found = True
                break
        if found:
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Variable '{variable_name}' not found")

    metadata["variables"] = variables_data
    db_entity.entity_metadata = metadata
    db_entity.updated_at = datetime.utcnow()

    await db.commit()

    return updated_var


@router.delete("/{entity_id}/variables/{variable_name}")
async def delete_variable(
    entity_id: UUID,
    variable_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Remove a variable definition from an entity"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    metadata = db_entity.entity_metadata or {}
    variables_data = metadata.get("variables", {"inputs": [], "outputs": []})

    # Find and remove the variable
    found = False
    for list_name in ["inputs", "outputs"]:
        for i, v in enumerate(variables_data.get(list_name, [])):
            if v["name"] == variable_name:
                variables_data[list_name].pop(i)
                found = True
                break
        if found:
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Variable '{variable_name}' not found")

    metadata["variables"] = variables_data
    db_entity.entity_metadata = metadata
    db_entity.updated_at = datetime.utcnow()

    await db.commit()

    return {"status": "deleted", "variable_name": variable_name}


@router.post("/{entity_id}/variables/validate", response_model=StateValidationResult)
async def validate_state_against_variables(
    entity_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Validate current state against variable definitions"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.id == entity_id)
    )
    db_entity = result.scalar_one_or_none()

    if not db_entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    metadata = db_entity.entity_metadata or {}
    variables_data = metadata.get("variables", {"inputs": [], "outputs": []})
    state = db_entity.state or {}

    warnings = []
    missing_required = []
    undefined_keys = []

    # Build variable lookup
    all_vars = {}
    for v in variables_data.get("inputs", []):
        all_vars[v["name"]] = v
    for v in variables_data.get("outputs", []):
        all_vars[v["name"]] = v

    # Type checking functions
    def check_type(value: Any, expected_type: str) -> bool:
        type_checks = {
            "string": lambda v: isinstance(v, str),
            "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            "boolean": lambda v: isinstance(v, bool),
            "array": lambda v: isinstance(v, list),
            "color": lambda v: isinstance(v, str),
            "vector2": lambda v: isinstance(v, dict) and "x" in v and "y" in v,
            "vector3": lambda v: isinstance(v, dict) and "x" in v and "y" in v and "z" in v,
            "range": lambda v: isinstance(v, (int, float)),
            "enum": lambda v: True,
            "object": lambda v: isinstance(v, dict),
        }
        return type_checks.get(expected_type, lambda v: True)(value)

    # Check each state key
    for key, value in state.items():
        if key in all_vars:
            var_def = all_vars[key]
            expected_type = var_def.get("type", "string")
            if not check_type(value, expected_type):
                actual_type = type(value).__name__
                warnings.append(ValidationWarning(
                    variable_name=key,
                    expected_type=expected_type,
                    actual_type=actual_type,
                    message=f"State key '{key}' has type '{actual_type}' but expected '{expected_type}'"
                ))
        else:
            undefined_keys.append(key)

    # Check for missing required inputs
    for v in variables_data.get("inputs", []):
        if v.get("required") and v["name"] not in state:
            missing_required.append(v["name"])
            warnings.append(ValidationWarning(
                variable_name=v["name"],
                expected_type=v.get("type", "string"),
                actual_type="missing",
                message=f"Required input '{v['name']}' is missing from state"
            ))

    return StateValidationResult(
        entity_id=db_entity.id,
        valid=len(warnings) == 0,
        warnings=warnings,
        missing_required=missing_required,
        undefined_keys=undefined_keys
    )


# =============================================================================
# ENTITY CRUD ENDPOINTS
# =============================================================================

@router.get("/{entity_id}", response_model=Entity)
async def get_entity(
    entity_id: UUID,
    include_children: bool = Query(False, description="Include immediate children"),
    db: AsyncSession = Depends(get_db)
):
    """Get entity by ID"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id == entity_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row
    response = entity_db_to_response(db_entity, entity_type)

    if include_children:
        children_result = await db.execute(
            select(EntityDB, EntityTypeDB)
            .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
            .where(EntityDB.parent_id == entity_id)
            .order_by(EntityDB.name)
        )
        children_rows = children_result.all()
        response.children = [entity_db_to_response(e, t) for e, t in children_rows]

    return response


@router.get("/by-slug/{slug}", response_model=Entity)
async def get_entity_by_slug(
    slug: str,
    include_children: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Get entity by slug"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.slug == slug)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row
    response = entity_db_to_response(db_entity, entity_type)

    if include_children:
        children_result = await db.execute(
            select(EntityDB, EntityTypeDB)
            .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
            .where(EntityDB.parent_id == db_entity.id)
            .order_by(EntityDB.name)
        )
        children_rows = children_result.all()
        response.children = [entity_db_to_response(e, t) for e, t in children_rows]

    return response


@router.put("/{entity_id}", response_model=Entity)
async def update_entity(
    entity_id: UUID,
    update: EntityUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update entity metadata (not state - use state endpoints for that)"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id == entity_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row

    # Verify new parent if changing
    if update.parent_id is not None and update.parent_id != db_entity.parent_id:
        if update.parent_id == entity_id:
            raise HTTPException(status_code=400, detail="Entity cannot be its own parent")

        result = await db.execute(
            select(EntityDB).where(EntityDB.id == update.parent_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Parent entity not found")

    # Apply updates
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == 'metadata':
            setattr(db_entity, 'entity_metadata', value)
        else:
            setattr(db_entity, field, value)

    await db.commit()
    await db.refresh(db_entity)

    response = entity_db_to_response(db_entity, entity_type)

    # Broadcast lifecycle event
    await state_manager.broadcast_entity_lifecycle(
        "updated",
        db_entity.id,
        db_entity.slug,
        entity_type.name,
        update_data
    )

    return response


@router.delete("/{entity_id}")
async def delete_entity(
    entity_id: UUID,
    cascade: bool = Query(False, description="Delete children (otherwise orphan them)"),
    db: AsyncSession = Depends(get_db)
):
    """Delete an entity"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id == entity_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row

    if cascade:
        # Delete all descendants using recursive CTE
        await db.execute(text("""
            WITH RECURSIVE descendants AS (
                SELECT id FROM entities WHERE parent_id = :entity_id
                UNION ALL
                SELECT e.id FROM entities e
                INNER JOIN descendants d ON e.parent_id = d.id
            )
            DELETE FROM entities WHERE id IN (SELECT id FROM descendants)
        """), {"entity_id": entity_id})
    else:
        # Orphan children (set parent_id to NULL)
        await db.execute(text("""
            UPDATE entities SET parent_id = NULL WHERE parent_id = :entity_id
        """), {"entity_id": entity_id})

    # Delete the entity itself
    await db.execute(delete(EntityDB).where(EntityDB.id == entity_id))
    await db.commit()

    # Broadcast lifecycle event
    await state_manager.broadcast_entity_lifecycle(
        "deleted",
        entity_id,
        db_entity.slug,
        entity_type.name
    )

    return {"status": "deleted", "entity_id": str(entity_id), "cascade": cascade}


# =============================================================================
# HIERARCHY ENDPOINTS
# =============================================================================

@router.get("/{entity_id}/ancestors", response_model=List[Entity])
async def get_ancestors(entity_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get all ancestors of an entity (from root to direct parent)"""
    # First verify entity exists
    result = await db.execute(select(EntityDB).where(EntityDB.id == entity_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entity not found")

    # Use recursive CTE to get ancestors
    result = await db.execute(text("""
        WITH RECURSIVE ancestors AS (
            SELECT e.*, 0 as depth
            FROM entities e
            WHERE e.id = (SELECT parent_id FROM entities WHERE id = :entity_id)

            UNION ALL

            SELECT e.*, a.depth + 1
            FROM entities e
            INNER JOIN ancestors a ON e.id = a.parent_id
        )
        SELECT a.id, a.name, a.slug, a.entity_type_id, a.parent_id, a.path,
               a.state, a.state_updated_at, a.status, a.description, a.tags,
               a.metadata, a.device_id, a.created_at, a.updated_at,
               et.id as type_id, et.name as type_name, et.display_name, et.description as type_desc,
               et.icon, et.state_schema, et.default_state, et.metadata as type_metadata,
               et.created_at as type_created_at, et.updated_at as type_updated_at
        FROM ancestors a
        JOIN entity_types et ON a.entity_type_id = et.id
        ORDER BY depth DESC
    """), {"entity_id": entity_id})

    rows = result.fetchall()
    entities = []

    for row in rows:
        entity_type = EntityType(
            id=row.type_id,
            name=row.type_name,
            display_name=row.display_name,
            description=row.type_desc,
            icon=row.icon,
            state_schema=row.state_schema,
            default_state=row.default_state or {},
            metadata=row.type_metadata or {},
            created_at=row.type_created_at,
            updated_at=row.type_updated_at
        )
        entities.append(Entity(
            id=row.id,
            name=row.name,
            slug=row.slug,
            entity_type_id=row.entity_type_id,
            parent_id=row.parent_id,
            path=row.path,
            state=row.state or {},
            state_updated_at=row.state_updated_at or datetime.utcnow(),
            status=row.status or 'active',
            description=row.description,
            tags=row.tags or [],
            metadata=row.metadata or {},
            device_id=row.device_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
            entity_type=entity_type
        ))

    return entities


@router.get("/{entity_id}/descendants", response_model=List[Entity])
async def get_descendants(
    entity_id: UUID,
    max_depth: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Get all descendants of an entity"""
    # Verify entity exists
    result = await db.execute(select(EntityDB).where(EntityDB.id == entity_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entity not found")

    result = await db.execute(text("""
        WITH RECURSIVE descendants AS (
            SELECT e.*, 1 as depth
            FROM entities e
            WHERE e.parent_id = :entity_id

            UNION ALL

            SELECT e.*, d.depth + 1
            FROM entities e
            INNER JOIN descendants d ON e.parent_id = d.id
            WHERE d.depth < :max_depth
        )
        SELECT d.id, d.name, d.slug, d.entity_type_id, d.parent_id, d.path,
               d.state, d.state_updated_at, d.status, d.description, d.tags,
               d.metadata, d.device_id, d.created_at, d.updated_at, d.depth,
               et.id as type_id, et.name as type_name, et.display_name, et.description as type_desc,
               et.icon, et.state_schema, et.default_state, et.metadata as type_metadata,
               et.created_at as type_created_at, et.updated_at as type_updated_at
        FROM descendants d
        JOIN entity_types et ON d.entity_type_id = et.id
        ORDER BY d.path
    """), {"entity_id": entity_id, "max_depth": max_depth})

    rows = result.fetchall()
    entities = []

    for row in rows:
        entity_type = EntityType(
            id=row.type_id,
            name=row.type_name,
            display_name=row.display_name,
            description=row.type_desc,
            icon=row.icon,
            state_schema=row.state_schema,
            default_state=row.default_state or {},
            metadata=row.type_metadata or {},
            created_at=row.type_created_at,
            updated_at=row.type_updated_at
        )
        entities.append(Entity(
            id=row.id,
            name=row.name,
            slug=row.slug,
            entity_type_id=row.entity_type_id,
            parent_id=row.parent_id,
            path=row.path,
            state=row.state or {},
            state_updated_at=row.state_updated_at or datetime.utcnow(),
            status=row.status or 'active',
            description=row.description,
            tags=row.tags or [],
            metadata=row.metadata or {},
            device_id=row.device_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
            entity_type=entity_type
        ))

    return entities


@router.get("/{entity_id}/siblings", response_model=List[Entity])
async def get_siblings(entity_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get sibling entities (same parent, excluding self)"""
    result = await db.execute(select(EntityDB).where(EntityDB.id == entity_id))
    entity = result.scalar_one_or_none()

    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    query = select(EntityDB, EntityTypeDB).join(
        EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id
    ).where(EntityDB.id != entity_id)

    if entity.parent_id:
        query = query.where(EntityDB.parent_id == entity.parent_id)
    else:
        query = query.where(EntityDB.parent_id.is_(None))

    query = query.order_by(EntityDB.name)

    result = await db.execute(query)
    rows = result.all()

    return [entity_db_to_response(e, t) for e, t in rows]


# =============================================================================
# STATE MANAGEMENT ENDPOINTS
# =============================================================================

@router.get("/{entity_id}/state", response_model=StateResponse)
async def get_state(
    entity_id: UUID,
    paths: Optional[List[str]] = Query(None, description="JSON paths to return"),
    db: AsyncSession = Depends(get_db)
):
    """Get entity state"""
    result = await db.execute(select(EntityDB).where(EntityDB.id == entity_id))
    entity = result.scalar_one_or_none()

    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    state = entity.state or {}

    # Filter to specific paths if requested
    if paths:
        filtered_state = {}
        for path in paths:
            keys = path.split('.')
            value = state
            for key in keys:
                if isinstance(value, dict) and key in value:
                    value = value[key]
                else:
                    value = None
                    break
            if value is not None:
                filtered_state[path] = value
        state = filtered_state

    return StateResponse(
        entity_id=entity.id,
        entity_slug=entity.slug,
        state=state,
        state_updated_at=entity.state_updated_at or datetime.utcnow()
    )


@router.patch("/{entity_id}/state", response_model=StateResponse)
async def update_state(
    entity_id: UUID,
    update: StateUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Partial state update - merges with existing state"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id == entity_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row
    previous_state = db_entity.state or {}

    # Deep merge states
    def deep_merge(base: dict, update: dict) -> dict:
        result = base.copy()
        for key, value in update.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    new_state = deep_merge(previous_state, update.state)

    # Update database
    db_entity.state = new_state
    db_entity.state_updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_entity)

    # Record state history for analytics
    await record_state_change(
        db, db_entity.id, db_entity.slug, entity_type.name,
        db_entity.path, previous_state, new_state,
        source=update.source, device_id=db_entity.device_id
    )

    # Broadcast state change event with metadata for validation
    await state_manager.broadcast_state_change(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        entity_type=entity_type.name,
        entity_path=db_entity.path,
        previous_state=previous_state,
        new_state=new_state,
        source=update.source,
        entity_metadata=db_entity.entity_metadata
    )

    return StateResponse(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        state=new_state,
        state_updated_at=db_entity.state_updated_at
    )


@router.put("/{entity_id}/state", response_model=StateResponse)
async def set_state(
    entity_id: UUID,
    state_set: StateSet,
    db: AsyncSession = Depends(get_db)
):
    """Replace entire entity state"""
    result = await db.execute(
        select(EntityDB, EntityTypeDB)
        .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
        .where(EntityDB.id == entity_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Entity not found")

    db_entity, entity_type = row
    previous_state = db_entity.state or {}
    new_state = state_set.state

    # Update database
    db_entity.state = new_state
    db_entity.state_updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_entity)

    # Record state history for analytics
    await record_state_change(
        db, db_entity.id, db_entity.slug, entity_type.name,
        db_entity.path, previous_state, new_state,
        source=state_set.source, device_id=db_entity.device_id
    )

    # Broadcast state change event with metadata for validation
    await state_manager.broadcast_state_change(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        entity_type=entity_type.name,
        entity_path=db_entity.path,
        previous_state=previous_state,
        new_state=new_state,
        source=state_set.source,
        entity_metadata=db_entity.entity_metadata
    )

    return StateResponse(
        entity_id=db_entity.id,
        entity_slug=db_entity.slug,
        state=new_state,
        state_updated_at=db_entity.state_updated_at
    )


# =============================================================================
# BULK STATE ENDPOINTS
# =============================================================================

@router.post("/state/bulk-get", response_model=Dict[str, Dict[str, Any]])
async def bulk_get_state(
    entity_slugs: List[str],
    db: AsyncSession = Depends(get_db)
):
    """Get state for multiple entities by slug"""
    result = await db.execute(
        select(EntityDB).where(EntityDB.slug.in_(entity_slugs))
    )
    entities = result.scalars().all()

    return {e.slug: e.state or {} for e in entities}


@router.post("/state/bulk-update")
async def bulk_update_state(
    updates: Dict[str, Dict[str, Any]],
    source: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Update state for multiple entities by slug"""
    results = {}

    for slug, state_update in updates.items():
        result = await db.execute(
            select(EntityDB, EntityTypeDB)
            .join(EntityTypeDB, EntityDB.entity_type_id == EntityTypeDB.id)
            .where(EntityDB.slug == slug)
        )
        row = result.first()

        if row:
            db_entity, entity_type = row
            previous_state = db_entity.state or {}

            # Deep merge
            def deep_merge(base: dict, update: dict) -> dict:
                result = base.copy()
                for key, value in update.items():
                    if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                        result[key] = deep_merge(result[key], value)
                    else:
                        result[key] = value
                return result

            new_state = deep_merge(previous_state, state_update)
            db_entity.state = new_state
            db_entity.state_updated_at = datetime.utcnow()

            results[slug] = {"status": "updated", "state": new_state}

            # Record state history for analytics
            await record_state_change(
                db, db_entity.id, db_entity.slug, entity_type.name,
                db_entity.path, previous_state, new_state,
                source=source, device_id=db_entity.device_id
            )

            # Broadcast with metadata for validation
            await state_manager.broadcast_state_change(
                entity_id=db_entity.id,
                entity_slug=db_entity.slug,
                entity_type=entity_type.name,
                entity_path=db_entity.path,
                previous_state=previous_state,
                new_state=new_state,
                source=source,
                entity_metadata=db_entity.entity_metadata
            )
        else:
            results[slug] = {"status": "not_found"}

    await db.commit()

    return {"results": results}
