import { Route, RoutingDevice, getSignalType, SIGNAL_TYPES } from './types'

// =============================================================================
// Signal Compatibility (Phase 3, Task 8)
// =============================================================================

export type CompatibilityLevel = 'compatible' | 'convertible' | 'incompatible'

interface CompatibilityResult {
  level: CompatibilityLevel
  message?: string
}

/**
 * Pairs of signal types that can be converted between each other
 * (e.g., SDI<->HDMI via a converter box).
 */
const CONVERTIBLE_PAIRS: [string, string][] = [
  ['sdi', 'hdmi'],
]

/**
 * The 'data' signal type is considered universally compatible —
 * AI/processing/software nodes can accept and produce any signal.
 */
export function checkSignalCompatibility(fromPort: string, toPort: string): CompatibilityResult {
  const fromSig = getSignalType(fromPort)
  const toSig = getSignalType(toPort)

  // Exact match
  if (fromSig === toSig) {
    return { level: 'compatible' }
  }

  // Data is universally compatible (software/AI nodes)
  if (fromSig === 'data' || toSig === 'data') {
    return { level: 'compatible' }
  }

  // Check convertible pairs
  const isConvertible = CONVERTIBLE_PAIRS.some(
    ([a, b]) => (fromSig === a && toSig === b) || (fromSig === b && toSig === a)
  )
  if (isConvertible) {
    const fromLabel = SIGNAL_TYPES[fromSig]?.label || fromSig
    const toLabel = SIGNAL_TYPES[toSig]?.label || toSig
    return {
      level: 'convertible',
      message: `${fromLabel} \u2192 ${toLabel} requires a converter`,
    }
  }

  // Incompatible
  const fromLabel = SIGNAL_TYPES[fromSig]?.label || fromSig
  const toLabel = SIGNAL_TYPES[toSig]?.label || toSig
  return {
    level: 'incompatible',
    message: `${fromLabel} output is incompatible with ${toLabel} input`,
  }
}


// =============================================================================
// Loop Detection (Phase 3, Task 9)
// =============================================================================

/**
 * Detect if adding a new route would create a circular signal path.
 * Uses depth-first search from the destination device back through the graph.
 */
export function detectLoop(
  routes: Route[],
  newRoute: { from: string; to: string },
  devices: RoutingDevice[]
): { hasLoop: boolean; path?: string[] } {
  // If connecting to self, that's immediately a loop
  if (newRoute.from === newRoute.to) {
    const device = devices.find((d) => d.id === newRoute.from)
    return { hasLoop: true, path: [device?.name || newRoute.from] }
  }

  // Build adjacency list: device -> set of downstream device IDs
  const graph = new Map<string, Set<string>>()
  for (const route of routes) {
    if (!graph.has(route.from)) graph.set(route.from, new Set())
    graph.get(route.from)!.add(route.to)
  }

  // Add the proposed route temporarily
  if (!graph.has(newRoute.from)) graph.set(newRoute.from, new Set())
  graph.get(newRoute.from)!.add(newRoute.to)

  // DFS from the destination to see if we can reach the source
  const visited = new Set<string>()
  const pathStack: string[] = []

  function dfs(current: string, target: string): boolean {
    if (current === target) return true
    if (visited.has(current)) return false
    visited.add(current)
    pathStack.push(current)

    const neighbors = graph.get(current)
    if (neighbors) {
      for (const next of neighbors) {
        if (dfs(next, target)) return true
      }
    }

    pathStack.pop()
    return false
  }

  // Check: can we reach newRoute.from starting from newRoute.to?
  const hasLoop = dfs(newRoute.to, newRoute.from)

  if (hasLoop) {
    const deviceNames = [...pathStack, newRoute.from].map((id) => {
      const device = devices.find((d) => d.id === id)
      return device?.name || id
    })
    return { hasLoop: true, path: deviceNames }
  }

  return { hasLoop: false }
}


// =============================================================================
// Port Capacity Enforcement (Phase 3, Task 10)
// =============================================================================

/**
 * Signal types that support 1:N fanout (one output to multiple inputs).
 * Physical signals (SDI, HDMI) typically require a distribution amplifier for fanout.
 * Data/software signals can freely fan out.
 */
const FANOUT_ALLOWED: Set<string> = new Set(['data', 'stream'])

export interface CapacityViolation {
  deviceId: string
  port: string
  currentCount: number
  allowed: number
  signalType: string
}

/**
 * Check if adding a route would violate port capacity rules.
 * - Physical outputs: 1:1 (one output to one input) unless DA present
 * - Data/stream outputs: 1:N (unlimited fanout)
 * - All inputs: N:1 restricted to 1 (one input source only)
 */
export function checkPortCapacity(
  routes: Route[],
  newRoute: { from: string; fromPort: string; to: string; toPort: string }
): CapacityViolation | null {
  const outputSignal = getSignalType(newRoute.fromPort)
  const maxFanout = FANOUT_ALLOWED.has(outputSignal) ? Infinity : 1

  // Check output fanout
  const existingFromRoutes = routes.filter(
    (r) => r.from === newRoute.from && r.fromPort === newRoute.fromPort
  )
  if (existingFromRoutes.length >= maxFanout) {
    return {
      deviceId: newRoute.from,
      port: newRoute.fromPort,
      currentCount: existingFromRoutes.length,
      allowed: maxFanout,
      signalType: outputSignal,
    }
  }

  // Check input — only one source per input port
  const existingToRoutes = routes.filter(
    (r) => r.to === newRoute.to && r.toPort === newRoute.toPort
  )
  if (existingToRoutes.length >= 1) {
    return {
      deviceId: newRoute.to,
      port: newRoute.toPort,
      currentCount: existingToRoutes.length,
      allowed: 1,
      signalType: getSignalType(newRoute.toPort),
    }
  }

  return null
}
