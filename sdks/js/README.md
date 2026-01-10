# @maestra/sdk

JavaScript/TypeScript SDK for the Maestra immersive experience platform.

## Installation

```bash
npm install @maestra/sdk

# With MQTT support
npm install @maestra/sdk mqtt
```

## Quick Start

```typescript
import { MaestraClient } from '@maestra/sdk'

const client = new MaestraClient({
  apiUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8765',
  mqttUrl: 'ws://localhost:9001',
})

await client.connect()

// Get an entity
const light = await client.getEntityBySlug('room-a-light-1')
console.log('Light state:', light.state.data)

// Update state
await light.state.update({ brightness: 75 })

// Subscribe to state changes
light.state.onChange((event) => {
  console.log('State changed:', event.changed_keys)
  console.log('New state:', event.current_state)
})
await light.subscribe()
```

## Entity Management

```typescript
// List all entities
const entities = await client.getEntities()

// Filter by type
const rooms = await client.getEntities({ entityType: 'room' })

// Get entity types
const types = await client.getEntityTypes()

// Create a new entity
const light = await client.createEntity({
  name: 'Room A Light 1',
  entity_type_id: '<actuator-type-id>',
  parent_id: '<room-a-id>',
  state: { brightness: 0, color: '#ffffff' },
})

// Get entity hierarchy
const ancestors = await light.getAncestors()
const children = await light.getChildren()
```

## State Operations

```typescript
// Get current state
console.log(light.state.data)
console.log(light.state.get('brightness'))

// Update state (merge)
await light.state.update({
  brightness: 100,
  transition: 500,
})

// Replace entire state
await light.state.replace({
  brightness: 0,
  color: '#000000',
})

// Set single value
await light.state.set('brightness', 50)
```

## Real-time Subscriptions

```typescript
// Subscribe to entity state changes
const unsubscribe = light.state.onChange((event) => {
  console.log(`Entity: ${event.entity_slug}`)
  console.log(`Changed: ${event.changed_keys}`)
  console.log(`Previous: ${event.previous_state}`)
  console.log(`Current: ${event.current_state}`)
})

await light.subscribe()

// Later: unsubscribe
unsubscribe()
await light.unsubscribe()
```

## Browser Usage

```html
<script type="module">
import { MaestraClient } from 'https://unpkg.com/@maestra/sdk'

const client = new MaestraClient({
  apiUrl: 'http://localhost:8080',
  mqttUrl: 'ws://localhost:9001',
})

await client.connect()

const entity = await client.getEntityBySlug('my-entity')
console.log(entity.state.data)
</script>
```

## License

MIT
