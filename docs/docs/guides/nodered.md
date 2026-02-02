# Node-RED Guide

Node-RED provides visual flow-based programming for Maestra. Access at http://localhost:1880.

## First Flow Tutorial

1. Drag **mqtt in** node to canvas
2. Configure:
   - Server: `mosquitto:1883`
   - Topic: `maestra/devices/#`
3. Add **debug** node
4. Connect mqtt → debug
5. Click **Deploy**
6. View messages in Debug panel

## Common Patterns

### Sensor Threshold Alert

```
[mqtt in] → [switch] → [function] → [mqtt out]
            (temp>30)  (format msg)  (alert topic)
```

### Multi-Device Aggregation

```
[mqtt in] → [join] → [function] → [debug]
(device/+)  (array)   (calculate)
```

### Time-Based Control

```
[inject] → [function] → [mqtt out]
(every 1hr) (message)   (control)
```

## Fleet Manager Integration

Use **http request** node:

```
[inject] → [http request] → [debug]
           GET http://fleet-manager:8080/entities
```

## NATS Integration

Install node-red-contrib-nats:

1. Menu → Manage palette → Install
2. Search "node-red-contrib-nats"
3. Install

Configure NATS node:
- Server: `nats://nats:4222`
- Subject: `maestra.>`

## Flow Persistence

Flows are saved in `flows/flows.json` (mounted volume).

## Production

Enable authentication in `config/nodered/settings.js`:

```javascript
adminAuth: {
    type: "credentials",
    users: [{
        username: "admin",
        password: "$2b$08$...",  // bcrypt hash
        permissions: "*"
    }]
}
```

Generate password hash:
```bash
node-red admin hash-pw
```

## Related Documentation

- [MQTT Integration](mqtt.md) - MQTT protocol guide
- [Fleet Manager API](../api/fleet-manager.md) - REST API reference
