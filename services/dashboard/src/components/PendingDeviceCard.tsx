import type { Device } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { Card } from './Card'
import { DEVICE_TYPE_ICONS, DEFAULT_DEVICE_ICON } from './icons'
import { Check, X, Ban } from 'lucide-react'

interface PendingDeviceCardProps {
  device: Device
  onApprove: (device: Device) => void
  onReject: (device: Device) => void
  onBlock: (device: Device) => void
}

export function PendingDeviceCard({ device, onApprove, onReject, onBlock }: PendingDeviceCardProps) {
  const Icon = DEVICE_TYPE_ICONS[device.device_type] || DEFAULT_DEVICE_ICON
  const discoveredAt = device.last_seen
    ? new Date(device.last_seen).toLocaleString()
    : 'Unknown'

  return (
    <Card className="border-amber-500/30 hover:border-amber-500/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="w-10 h-10 rounded-lg bg-amber-900/30 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">{device.name}</h3>
            <p className="text-sm text-slate-400 mb-2">{device.device_type.replace('_', ' ')}</p>
            <StatusBadge status="pending" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onApprove(device)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={() => onReject(device)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            onClick={() => onBlock(device)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800/50 text-red-400 text-sm font-medium transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            Block
          </button>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-slate-500">Hardware ID:</span>
          <p className="text-slate-300 font-mono text-xs mt-1">{device.hardware_id}</p>
        </div>
        <div>
          <span className="text-slate-500">Discovered:</span>
          <p className="text-slate-300 text-xs mt-1">{discoveredAt}</p>
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
