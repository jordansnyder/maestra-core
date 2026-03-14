'use client'

import { useEffect, useRef } from 'react'
import { Pencil, Trash2, Copy, SlidersHorizontal } from '@/components/icons'

interface ContextMenuProps {
  x: number
  y: number
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
  onAdjustDMX: () => void
  onClose: () => void
}

export function ContextMenu({ x, y, onEdit, onCopy, onDelete, onAdjustDMX, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Nudge menu to stay within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  }

  return (
    <div
      ref={ref}
      style={style}
      className="w-44 rounded-lg bg-slate-800 border border-slate-700 shadow-2xl py-1 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onAdjustDMX(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
        Adjust DMX
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5 text-slate-400" />
        Edit Fixture
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onCopy(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-slate-400" />
        Copy Fixture
      </button>
      <div className="my-1 border-t border-slate-700" />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete Fixture
      </button>
    </div>
  )
}
