# Fleet Manager API

Base URL: `http://localhost:8080`

## Interactive Documentation

Visit http://localhost:8080/docs for Swagger UI.

## Health Check

```
GET /health
```

## Devices

```
GET    /devices           # List devices
POST   /devices           # Register device
GET    /devices/{id}      # Get device
PUT    /devices/{id}      # Update device
DELETE /devices/{id}      # Delete device
```

## Entities

See [Entities API](entities.md) for full documentation.
