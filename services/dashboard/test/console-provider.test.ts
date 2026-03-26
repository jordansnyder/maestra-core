import { describe, it, expect } from 'vitest'

// Test the protocol detection and source/destination resolution logic
// These are extracted from ConsoleProvider for unit testing

type Protocol = 'osc' | 'mqtt' | 'ws' | 'internal'

function detectProtocol(subject: string): Protocol {
  if (subject.startsWith('maestra.osc.')) return 'osc'
  if (subject.startsWith('maestra.mqtt.')) return 'mqtt'
  if (subject.includes('websocket') || subject.startsWith('maestra.ws.')) return 'ws'
  return 'internal'
}

describe('Protocol Detection', () => {
  it('detects OSC protocol from subject prefix', () => {
    expect(detectProtocol('maestra.osc.device.temp')).toBe('osc')
    expect(detectProtocol('maestra.osc.entity.update')).toBe('osc')
  })

  it('detects MQTT protocol from subject prefix', () => {
    expect(detectProtocol('maestra.mqtt.maestra.device.temp')).toBe('mqtt')
    expect(detectProtocol('maestra.mqtt.sensors.humidity')).toBe('mqtt')
  })

  it('detects WebSocket protocol from subject', () => {
    expect(detectProtocol('maestra.ws.client.123')).toBe('ws')
    expect(detectProtocol('maestra.websocket.broadcast')).toBe('ws')
  })

  it('defaults to internal for entity state and other subjects', () => {
    expect(detectProtocol('maestra.entity.state.update.light1')).toBe('internal')
    expect(detectProtocol('maestra.stream.advertise')).toBe('internal')
    expect(detectProtocol('maestra.device.heartbeat')).toBe('internal')
  })

  it('handles empty and edge case subjects', () => {
    expect(detectProtocol('')).toBe('internal')
    expect(detectProtocol('maestra')).toBe('internal')
    expect(detectProtocol('random.topic')).toBe('internal')
  })
})

describe('Message Filtering', () => {
  it('identifies heartbeat messages from subject', () => {
    const heartbeatSubjects = [
      'maestra.device.heartbeat',
      'maestra.stream.heartbeat.abc123',
      'maestra.stream.session.heartbeat.xyz',
    ]
    heartbeatSubjects.forEach(subject => {
      expect(subject.includes('heartbeat')).toBe(true)
    })
  })

  it('does not flag non-heartbeat messages', () => {
    const nonHeartbeat = [
      'maestra.entity.state.update.light1',
      'maestra.stream.advertise',
      'maestra.osc.device.temp',
    ]
    nonHeartbeat.forEach(subject => {
      expect(subject.includes('heartbeat')).toBe(false)
    })
  })
})

describe('Subject Parsing for Entity State', () => {
  it('extracts entity slug from state update subjects', () => {
    const match = 'maestra.entity.state.update.stage-light-5'.match(
      /maestra\.entity\.state\.(update|set)\.(.+)/
    )
    expect(match).toBeTruthy()
    expect(match![1]).toBe('update')
    expect(match![2]).toBe('stage-light-5')
  })

  it('extracts entity slug from state set subjects', () => {
    const match = 'maestra.entity.state.set.dmx-controller'.match(
      /maestra\.entity\.state\.(update|set)\.(.+)/
    )
    expect(match).toBeTruthy()
    expect(match![1]).toBe('set')
    expect(match![2]).toBe('dmx-controller')
  })

  it('extracts entity slug from broadcast subjects', () => {
    const match = 'maestra.entity.state.light.stage-light-5'.match(
      /maestra\.entity\.state\.([^.]+)\.(.+)/
    )
    expect(match).toBeTruthy()
    expect(match![1]).toBe('light')
    expect(match![2]).toBe('stage-light-5')
  })

  it('does not match non-entity subjects', () => {
    const match = 'maestra.stream.advertise'.match(
      /maestra\.entity\.state\.(update|set)\.(.+)/
    )
    expect(match).toBeNull()
  })
})
