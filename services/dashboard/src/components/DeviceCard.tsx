import type { Device } from '@/types'
import { StatusBadge } from './StatusBadge'
import { Card } from './Card'

interface DeviceCardProps {
  device: Device
  onDelete?: (device: Device) => void
}

const deviceIcons: Record<string, string> = {
  arduino: '🤖',
  raspberry_pi: '🥧',
  esp32: '📡',
  touchdesigner: '🎨',
  max_msp: '🎵',
  unreal_engine: '🎮',
  web_client: '🌐',
  mobile_client: '📱',
}

export function DeviceCard({ device, onDelete }: DeviceCardProps) {
  const icon = deviceIcons[device.device_type] || '📟'
  const lastSeen = device.last_seen
    ? new Date(device.last_seen).toLocaleString()
    : 'Never'

  return (
    <Card className="hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="text-4xl">{icon}</div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{device.name}</h3>
            <p className="text-sm text-slate-400 mb-2">{device.device_type.replace('_', ' ')}</p>
            <StatusBadge status={device.status} />
          </div>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(device)}
            className="text-red-400 hover:text-red-300 text-sm px-2 py-1"
          >
            Delete
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-500">Hardware ID:</span>
          <p className="text-slate-300 font-mono text-xs mt-1">{device.hardware_id}</p>
        </div>
        <div>
          <span className="text-slate-500">Last Seen:</span>
          <p className="text-slate-300 text-xs mt-1">{lastSeen}</p>
        </div>
        {device.ip_address && (
          <div>
            <span className="text-slate-500">IP Address:</span>
            <p className="text-slate-300 font-mono text-xs mt-1">{device.ip_address}</p>
          </div>
        )}
        {device.firmware_version && (
          <div>
            <span className="text-slate-500">Firmware:</span>
            <p className="text-slate-300 text-xs mt-1">{device.firmware_version}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
