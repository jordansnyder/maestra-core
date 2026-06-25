import type { BlockedDevice } from '@/lib/types'
import { Card } from './Card'
import { Unlock } from 'lucide-react'

interface BlockedDevicesListProps {
  devices: BlockedDevice[]
  onUnblock: (hardwareId: string) => void
}

export function BlockedDevicesList({ devices, onUnblock }: BlockedDevicesListProps) {
  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-fg-subtle">
        <p>No blocked devices.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {devices.map(device => (
        <Card key={device.id} className="hover:border-edge-strong transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-mono text-sm text-fg">{device.hardware_id}</p>
              {device.reason && (
                <p className="text-xs text-fg-subtle mt-1">Reason: {device.reason}</p>
              )}
              <p className="text-xs text-fg-subtle mt-1">
                Blocked: {new Date(device.blocked_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => onUnblock(device.hardware_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-2 text-fg text-sm font-medium transition-colors"
            >
              <Unlock className="w-3.5 h-3.5" />
              Unblock
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
