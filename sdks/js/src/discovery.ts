/**
 * Maestra Discovery & Provisioning
 *
 * Provides mDNS-based service discovery (Node.js only) and
 * Fleet Manager device advertisement/provisioning helpers.
 */

import type { DiscoveryConfig, ProvisionConfig, AdvertiseDeviceOptions } from './types'

/**
 * Discover a Maestra instance on the local network via mDNS.
 *
 * Browses for `_maestra._tcp.local.` services and parses TXT records
 * to build a ConnectionConfig. Requires the `bonjour-service` package
 * and a Node.js runtime (mDNS is not available in browsers).
 *
 * @param options.timeout - How long to wait for discovery in ms (default: 5000)
 * @returns Resolved DiscoveryConfig from the first discovered instance
 */
export async function discoverMaestra(
  options: { timeout?: number } = {}
): Promise<DiscoveryConfig> {
  const timeout = options.timeout ?? 5000

  // Dynamic import so the module is not required at bundle time.
  // bonjour-service is an optional peer dependency.
  let Bonjour: typeof import('bonjour-service').default
  try {
    const mod = await import('bonjour-service')
    Bonjour = mod.default ?? (mod as unknown as typeof import('bonjour-service')).default
  } catch {
    throw new Error(
      'mDNS discovery requires the "bonjour-service" package and a Node.js runtime. ' +
      'Install it with: npm install bonjour-service'
    )
  }

  return new Promise<DiscoveryConfig>((resolve, reject) => {
    const instance = new Bonjour()
    const timer = setTimeout(() => {
      browser.stop()
      instance.destroy()
      reject(new Error(`Maestra discovery timed out after ${timeout}ms`))
    }, timeout)

    const browser = instance.find({ type: 'maestra' }, (service) => {
      clearTimeout(timer)
      browser.stop()

      // Parse TXT record key-value pairs
      const txt: Record<string, string> = {}
      if (service.txt && typeof service.txt === 'object') {
        for (const [key, value] of Object.entries(service.txt)) {
          txt[key] = String(value)
        }
      }

      const host = service.host || 'localhost'
      const port = service.port || 8080

      const config: DiscoveryConfig = {
        apiUrl: txt['apiUrl'] || `http://${host}:${port}`,
        natsUrl: txt['natsUrl'],
        mqttUrl: txt['mqttUrl'],
        wsUrl: txt['wsUrl'],
        mqttPort: txt['mqttPort'] ? parseInt(txt['mqttPort'], 10) : undefined,
      }

      instance.destroy()
      resolve(config)
    })
  })
}

/**
 * Advertise this device to the Fleet Manager for discovery.
 *
 * Posts device information to the `/devices/discover` endpoint so
 * the Maestra instance can register and optionally provision the device.
 *
 * @param options - Device advertisement details
 * @returns The response body from the Fleet Manager
 */
export async function advertiseDevice(
  options: AdvertiseDeviceOptions
): Promise<Record<string, unknown>> {
  const { apiUrl, ...body } = options
  const url = `${apiUrl.replace(/\/$/, '')}/devices/discover`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hardware_id: body.hardwareId,
      device_type: body.deviceType,
      name: body.name,
      metadata: body.metadata,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Poll the Fleet Manager until a device is provisioned.
 *
 * Repeatedly fetches `GET /devices/{deviceId}/provision` until
 * the returned status is `"provisioned"`, then returns the
 * provision configuration.
 *
 * @param apiUrl - Fleet Manager base URL
 * @param deviceId - Device ID to poll provisioning for
 * @param options.pollInterval - Interval between polls in ms (default: 3000)
 * @param options.timeout - Maximum time to wait in ms (default: 300000 / 5 min)
 * @returns Provision configuration once the device is provisioned
 */
export async function waitForProvisioning(
  apiUrl: string,
  deviceId: string,
  options: { pollInterval?: number; timeout?: number } = {}
): Promise<ProvisionConfig> {
  const pollInterval = options.pollInterval ?? 3000
  const timeout = options.timeout ?? 300_000
  const baseUrl = apiUrl.replace(/\/$/, '')
  const url = `${baseUrl}/devices/${deviceId}/provision`
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    const data = await response.json() as Record<string, unknown>

    if (data.provision_status === 'provisioned' || data.provisionStatus === 'provisioned') {
      return {
        deviceId: (data.device_id ?? data.deviceId ?? deviceId) as string,
        entityId: (data.entity_id ?? data.entityId) as string | undefined,
        envVars: (data.env_vars ?? data.envVars) as Record<string, string> | undefined,
        connectionConfig: (data.connection_config ?? data.connectionConfig) as
          | import('./types').ConnectionConfig
          | undefined,
        provisionStatus: 'provisioned',
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Provisioning timed out after ${timeout}ms for device ${deviceId}`)
}
