# Entities API

## Entity Types

```
GET    /entities/types              # List types
POST   /entities/types              # Create type
GET    /entities/types/{id}         # Get type
PUT    /entities/types/{id}         # Update type
DELETE /entities/types/{id}         # Delete type
```

## Entities

```
GET    /entities                    # List entities
POST   /entities                    # Create entity
GET    /entities/{id}               # Get entity
GET    /entities/by-slug/{slug}     # Get by slug
PUT    /entities/{id}               # Update entity
DELETE /entities/{id}               # Delete entity
```

## Hierarchy

```
GET    /entities/{id}/ancestors     # Get ancestors
GET    /entities/{id}/descendants   # Get descendants
GET    /entities/{id}/siblings      # Get siblings
GET    /entities/tree               # Get full tree
```

## State Management

```
GET    /entities/{id}/state         # Get state
PATCH  /entities/{id}/state         # Update state (merge)
PUT    /entities/{id}/state         # Replace state
```

### Update State Example

```bash
curl -X PATCH http://localhost:8080/entities/{id}/state \
  -H "Content-Type: application/json" \
  -d '{
    "state": {"brightness": 75},
    "source": "api"
  }'
```
