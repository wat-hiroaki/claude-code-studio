import { useEffect, useState } from 'react'
import { X, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@lib/utils'

type ToastType = 'info' | 'success' | 'warning' | 'error'

interface Toast {
  id: number
  title: string
  body: string
  type: ToastType
  count: number
}

let toastId = 0
const listeners: Set<(toast: Toast) => void> = new Set()

// Dedup tracking: key → { id, timestamp }
const recentToasts = new Map<string, { id: number; ts: number }>()
const DEDUP_WINDOW_MS = 5000

function dedupeKey(title: string, type: string): string {
  return `${type}::${title}`
}

export function showToast(message: string, type: ToastType): void
export function showToast(title: string, body: string, type: ToastType): void
export function showToast(titleOrMessage: string, bodyOrType: string, maybeType?: ToastType): void {
  let title: string
  let body: string
  let type: ToastType

  if (maybeType !== undefined) {
    title = titleOrMessage; body = bodyOrType; type = maybeType
  } else if (['info', 'success', 'warning', 'error'].includes(bodyOrType)) {
    title = titleOrMessage; body = ''; type = bodyOrType as ToastType
  } else {
    title = titleOrMessage; body = bodyOrType; type = 'info'
  }

  const key = dedupeKey(title, type)
  const now = Date.now()
  const existing = recentToasts.get(key)

  if (existing && now - existing.ts < DEDUP_WINDOW_MS) {
    // Bump count on existing toast instead of creating a new one
    listeners.forEach((fn) => fn({ id: existing.id, title, body, type, count: -1 }))
    existing.ts = now
    return
  }

  const id = ++toastId
  recentToasts.set(key, { id, ts: now })
  listeners.forEach((fn) => fn({ id, title, body, type, count: 1 }))
}

export function ToastContainer(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>()

    const handler = (toast: Toast): void => {
      if (toast.count === -1) {
        // Bump count on existing toast
        setToasts((prev) => prev.map((t) =>
          t.id === toast.id ? { ...t, count: t.count + 1 } : t
        ))
        // Reset dismiss timer
        const existing = dismissTimers.get(toast.id)
        if (existing) clearTimeout(existing)
        dismissTimers.set(toast.id, setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id))
          dismissTimers.delete(toast.id)
        }, 5000))
        return
      }

      setToasts((prev) => [...prev, toast])
      dismissTimers.set(toast.id, setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
        dismissTimers.delete(toast.id)
      }, 5000))
    }
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
      dismissTimers.forEach((t) => clearTimeout(t))
    }
  }, [])

  const removeToast = (id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const icons = {
    info: null,
    success: <CheckCircle2 size={16} className="text-green-500" />,
    warning: <AlertTriangle size={16} className="text-yellow-500" />,
    error: <AlertCircle size={16} className="text-red-500" />
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={cn(
            'bg-card border border-border rounded-lg shadow-xl p-3 flex items-start gap-2 animate-in slide-in-from-bottom-2',
            'transition-all duration-300'
          )}
        >
          {icons[toast.type]}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium flex items-center gap-1.5">
              {toast.title}
              {toast.count > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                  ×{toast.count}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">{toast.body}</div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-0.5 hover:bg-accent rounded"
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
