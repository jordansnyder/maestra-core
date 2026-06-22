/**
 * Unit tests for the Maestra JS/TS SDK entity + state logic.
 *
 * These cover the pure client-side behaviour (state container, subscriptions,
 * optimistic updates) with the HTTP transport replaced by a recording stub —
 * no running Maestra instance required.
 */
import { describe, it, expect, vi } from 'vitest'
import { EntityState, Entity } from '../src/index'
import type { StateChangeEvent, EntityData } from '../src/types'

function makeEvent(current: Record<string, unknown>, changed: string[]): StateChangeEvent {
  return {
    type: 'state_changed',
    entity_id: 'ent-1',
    entity_slug: 'main-light',
    entity_type: 'actuator',
    path: undefined,
    previous_state: {},
    current_state: current,
    changed_keys: changed,
    source: 'test',
    timestamp: '2026-01-01T00:00:00Z',
  } as unknown as StateChangeEvent
}

function makeEntity(state: Record<string, unknown> = {}) {
  const calls: Array<[string, string, Record<string, unknown>, string | undefined]> = []
  const fakeClient = {
    _http: {
      async updateState(id: string, s: Record<string, unknown>, source?: string) {
        calls.push(['update', id, s, source])
      },
      async setState(id: string, s: Record<string, unknown>, source?: string) {
        calls.push(['set', id, s, source])
      },
    },
  }
  const data = {
    id: 'ent-1',
    name: 'Main Light',
    slug: 'main-light',
    entity_type_id: 'type-1',
    state: { ...state },
    status: 'active',
    tags: ['lighting'],
    metadata: {},
  } as unknown as EntityData
  const entity = new Entity(fakeClient as never, data)
  return { entity, calls }
}

describe('EntityState', () => {
  it('reads values and applies defaults', () => {
    const s = new EntityState(null as never, { brightness: 50 })
    expect(s.get('brightness')).toBe(50)
    expect(s.get('missing', 'fallback')).toBe('fallback')
  })

  it('returns a copy from .data', () => {
    const s = new EntityState(null as never, { brightness: 50 })
    const snap = s.data
    snap.brightness = 999
    expect(s.get('brightness')).toBe(50)
  })

  it('applies updates and notifies subscribers, then stops after unsubscribe', () => {
    const s = new EntityState(null as never, { brightness: 10 })
    const seen: Record<string, unknown>[] = []
    const unsub = s.onChange((ev) => seen.push(ev.current_state))

    s._applyUpdate(makeEvent({ brightness: 80, color: '#fff' }, ['brightness', 'color']))
    expect(s.get('brightness')).toBe(80)
    expect(s.get('color')).toBe('#fff')
    expect(seen).toHaveLength(1)

    unsub()
    s._applyUpdate(makeEvent({ brightness: 0 }, ['brightness']))
    expect(seen).toHaveLength(1)
  })

  it('keeps dispatching when a callback throws', () => {
    const s = new EntityState(null as never, {})
    const good = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    s.onChange(() => {
      throw new Error('boom')
    })
    s.onChange(good)
    s._applyUpdate(makeEvent({ x: 1 }, ['x']))
    expect(good).toHaveBeenCalledOnce()
  })
})

describe('Entity', () => {
  it('exposes properties and serializes via toJSON', () => {
    const { entity } = makeEntity({ brightness: 25 })
    expect(entity.id).toBe('ent-1')
    expect(entity.slug).toBe('main-light')
    const json = entity.toJSON()
    expect(json.slug).toBe('main-light')
    expect(json.state).toEqual({ brightness: 25 })
  })

  it('merges on update and calls updateState', async () => {
    const { entity, calls } = makeEntity({ brightness: 25 })
    await entity.state.update({ color: '#ff0000' }, 'test')
    expect(entity.state.get('brightness')).toBe(25)
    expect(entity.state.get('color')).toBe('#ff0000')
    expect(calls).toEqual([['update', 'ent-1', { color: '#ff0000' }, 'test']])
  })

  it('overwrites on replace and calls setState', async () => {
    const { entity, calls } = makeEntity({ brightness: 25, color: '#fff' })
    await entity.state.replace({ brightness: 100 }, 'test')
    expect(entity.state.data).toEqual({ brightness: 100 })
    expect(calls).toEqual([['set', 'ent-1', { brightness: 100 }, 'test']])
  })
})
