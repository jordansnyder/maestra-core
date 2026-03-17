/**
 * Dynamic host resolution for Maestra service URLs.
 *
 * Priority:
 *   1. NEXT_PUBLIC_* env vars passed via Docker Compose (using HOST_IP)
 *   2. window.location.hostname (works for remote browser access)
 *   3. "localhost" fallback (SSR / non-browser contexts without env vars)
 *
 * Docker Compose sets HOST_IP and passes it through env vars like:
 *   NEXT_PUBLIC_API_URL=http://${HOST_IP:-localhost}:8080
 *   NEXT_PUBLIC_NODERED_URL=http://${HOST_IP:-localhost}:1880
 *   etc.
 */

function getHost(): string {
  // First: try to extract host from the API URL env var (works during SSR too)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  if (apiUrl) {
    try {
      const url = new URL(apiUrl)
      return url.hostname
    } catch {
      // fall through
    }
  }
  // Second: use browser location (works for remote access)
  if (typeof window !== 'undefined') {
    return window.location.hostname
  }
  // Last resort
  return 'localhost'
}

// ---------------------------------------------------------------------------
// Core service URLs (used by API client and WebSocket hooks)
// ---------------------------------------------------------------------------

/** Fleet Manager REST API */
export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || `http://${getHost()}:8080`
}

/** WebSocket Gateway */
export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || `ws://${getHost()}:8765`
}

// ---------------------------------------------------------------------------
// External service links (opened in new tabs)
// ---------------------------------------------------------------------------

export function getServiceLinks() {
  const host = getHost()
  return {
    nodeRed:       process.env.NEXT_PUBLIC_NODERED_URL  || `http://${host}:1880`,
    grafana:       process.env.NEXT_PUBLIC_GRAFANA_URL   || `http://${host}:3000`,
    apiDocs:       `${process.env.NEXT_PUBLIC_API_URL || `http://${host}:8080`}/docs`,
    docs:          process.env.NEXT_PUBLIC_DOCS_URL      || `http://${host}:8000`,
    natsMonitor:   process.env.NEXT_PUBLIC_NATS_URL      || `http://${host}:8222`,
    fleetManager:  process.env.NEXT_PUBLIC_API_URL       || `http://${host}:8080`,
    nats:          `nats://${host}:4222`,
    database:      `${host}:5432`,
  }
}

// ---------------------------------------------------------------------------
// Documentation deep-links
// ---------------------------------------------------------------------------

export function getDocsUrl(path: string): string {
  const docsBase = process.env.NEXT_PUBLIC_DOCS_URL || `http://${getHost()}:8000`
  return `${docsBase}${path}`
}
