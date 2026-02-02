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

## Entity Variables

Entity Variables define typed input/output fields with validation for entities. Variables map to state keys and provide type checking, default values, and configuration.

```
GET    /entities/{entity_id}/variables                    # List all variables
PUT    /entities/{entity_id}/variables                    # Replace all variables
POST   /entities/{entity_id}/variables                    # Create single variable
PUT    /entities/{entity_id}/variables/{variable_name}    # Update variable
DELETE /entities/{entity_id}/variables/{variable_name}    # Delete variable
POST   /entities/{entity_id}/variables/validate           # Validate state
```

### Variable Types

- `string` - Text value
- `number` - Integer or float
- `boolean` - True/false
- `array` - List of values
- `color` - Color value (hex or rgb)
- `vector2` - 2D vector {x, y}
- `vector3` - 3D vector {x, y, z}
- `range` - Numeric range with min/max
- `enum` - One of predefined values
- `object` - Complex JSON object

### Variable Direction

- `input` - Variable is an input to the entity (can be set externally)
- `output` - Variable is an output from the entity (read-only)

### Get All Variables

```bash
curl http://localhost:8080/entities/{entity_id}/variables
```

Response:
```json
{
  "entity_id": "123e4567-e89b-12d3-a456-426614174000",
  "entity_slug": "gallery-light-1",
  "variables": {
    "inputs": [
      {
        "name": "brightness",
        "type": "number",
        "direction": "input",
        "description": "Light brightness percentage",
        "defaultValue": 100,
        "required": true,
        "config": {
          "min": 0,
          "max": 100,
          "unit": "%"
        }
      },
      {
        "name": "color",
        "type": "color",
        "direction": "input",
        "description": "Light color",
        "defaultValue": "#ffffff",
        "required": false,
        "config": {}
      }
    ],
    "outputs": [
      {
        "name": "power_consumption",
        "type": "number",
        "direction": "output",
        "description": "Current power usage",
        "config": {
          "unit": "watts"
        }
      }
    ]
  }
}
```

### Create Variable

```bash
curl -X POST http://localhost:8080/entities/{entity_id}/variables \
  -H "Content-Type: application/json" \
  -d '{
    "name": "brightness",
    "type": "number",
    "direction": "input",
    "description": "Light brightness percentage",
    "defaultValue": 100,
    "required": true,
    "config": {
      "min": 0,
      "max": 100,
      "unit": "%"
    }
  }'
```

### Update Variable

```bash
curl -X PUT http://localhost:8080/entities/{entity_id}/variables/brightness \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "config": {
      "min": 0,
      "max": 255,
      "unit": "level"
    }
  }'
```

### Replace All Variables

Replace the entire variables definition for an entity:

```bash
curl -X PUT http://localhost:8080/entities/{entity_id}/variables \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      {
        "name": "on",
        "type": "boolean",
        "direction": "input",
        "defaultValue": false,
        "required": true
      }
    ],
    "outputs": []
  }'
```

### Delete Variable

```bash
curl -X DELETE http://localhost:8080/entities/{entity_id}/variables/brightness
```

### Validate State

Check if the current entity state matches variable definitions:

```bash
curl -X POST http://localhost:8080/entities/{entity_id}/variables/validate
```

Response:
```json
{
  "entity_id": "123e4567-e89b-12d3-a456-426614174000",
  "valid": false,
  "warnings": [
    {
      "variable_name": "brightness",
      "expected_type": "number",
      "actual_type": "string",
      "message": "Expected number but got string",
      "severity": "warning"
    }
  ]
}
```

### Variable Configuration Examples

**Number with Range:**
```json
{
  "name": "temperature",
  "type": "number",
  "direction": "output",
  "config": {
    "min": -40,
    "max": 85,
    "unit": "°C",
    "precision": 1
  }
}
```

**Enum:**
```json
{
  "name": "mode",
  "type": "enum",
  "direction": "input",
  "config": {
    "options": ["auto", "manual", "off"]
  }
}
```

**Vector3:**
```json
{
  "name": "position",
  "type": "vector3",
  "direction": "output",
  "defaultValue": {"x": 0, "y": 0, "z": 0}
}
```
