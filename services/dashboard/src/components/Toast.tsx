'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from '@/components/icons'
import type { LucideIcon } from 'lucide-react'

// --- Types ---

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
  exiting: boolean
}

interface ToastOptions {
  message: string
  type?: ToastType
  duration?: number
}

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
}

interface ToastContextValue {
  toast: (options: ToastOptions | string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

// --- Context ---

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// --- Config ---

const TOAST_CONFIG: Record<ToastType, { icon: LucideIcon; bg: string; border: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-green-950/90', border: 'border-green-800/40', iconColor: 'text-green-400' },
  error: { icon: XCircle, bg: 'bg-red-950/90', border: 'border-red-800/40', iconColor: 'text-red-400' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-950/90', border: 'border-amber-800/40', iconColor: 'text-amber-400' },
  info: { icon: Info, bg: 'bg-blue-950/90', border: 'border-blue-800/40', iconColor: 'text-blue-400' },
}

// --- Provider ---

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const idCounter = useRef(0)

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const startExit = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    setTimeout(() => removeToast(id), 300)
  }, [removeToast])

  const toast = useCallback((options: ToastOptions | string) => {
    const opts: ToastOptions = typeof options === 'string' ? { message: options } : options
    const id = `toast-${++idCounter.current}`
    const item: ToastItem = {
      id,
      message: opts.message,
      type: opts.type || 'info',
      duration: opts.duration || 4000,
      exiting: false,
    }
    setToasts((prev) => [...prev, item])
    setTimeout(() => startExit(id), item.duration)
  }, [startExit])

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ options, resolve })
    })
  }, [])

  const handleConfirmResult = useCallback((result: boolean) => {
    confirmState?.resolve(result)
    setConfirmState(null)
  }, [confirmState])

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((item) => {
          const config = TOAST_CONFIG[item.type]
          const Icon = config.icon
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg max-w-sm ${config.bg} ${config.border}`}
              style={{
                animation: item.exiting
                  ? 'fadeOut 0.3s ease-out forwards'
                  : 'slideInRight 0.3s ease-out',
              }}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} />
              <p className="text-sm text-slate-200 flex-1">{item.message}</p>
              <button
                onClick={() => startExit(item.id)}
                className="text-slate-500 hover:text-slate-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              {confirmState.options.title}
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              {confirmState.options.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleConfirmResult(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmResult(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  confirmState.options.destructive
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {confirmState.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
