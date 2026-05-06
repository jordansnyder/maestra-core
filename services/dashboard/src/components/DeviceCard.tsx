import type { Device } from '@/lib/types'
import { Card } from './Card'
import { DEVICE_TYPE_ICONS, DEFAULT_DEVICE_ICON, Trash2, Zap } from './icons'

const STATUS_DOT_COLORS: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-slate-500',
  error: 'bg-red-400',
  maintenance: 'bg-amber-400',
  pending: 'bg-blue-400',
}

interface DeviceCardProps {
  device: Device
  onDelete?: (device: Device) => void
  onClick?: (device: Device) => void
}

export function DeviceCard({ device, onDelete, onClick }: DeviceCardProps) {
  const Icon = DEVICE_TYPE_ICONS[device.device_type] || DEFAULT_DEVICE_ICON
  const lastSeen = device.last_seen
    ? new Date(device.last_seen).toLocaleString()
    : 'Never'

  const configKeys = Object.keys(device.configuration || {})

  return (
    <Card
      className="hover:border-slate-600 transition-colors cursor-pointer"
      onClick={() => onClick?.(device)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-slate-300" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT_COLORS[device.status] || 'bg-slate-500'}`} />
              <h3 className="font-semibold text-lg">{device.name}</h3>
              {device.device_type === 'artnet_node' && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  <Zap className="w-2.5 h-2.5" />
                  DMX
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mb-2">{device.device_type.replace(/_/g, ' ')}</p>
          </div>
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(device) }}
            className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-500">MAC Address:</span>
          <p className="text-slate-300 font-mono text-xs mt-1 uppercase">{device.hardware_id}</p>
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

      {/* Config Key Pills */}
      {configKeys.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <span className="text-slate-500 text-xs">Config: </span>
          <div className="inline-flex flex-wrap gap-1 mt-1">
            {configKeys.map(key => (
              <span
                key={key}
                className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] font-mono text-slate-400"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
