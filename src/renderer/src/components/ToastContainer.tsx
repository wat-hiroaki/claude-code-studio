import { useEffect, useState } from 'react'
import { X, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

interface Toast {
  id: number
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
}

let toastId = 0
const listeners: Set<(toast: Toast) => void> = new Set()

export function showToast(title: string, body: string, type: Toast['type'] = 'info'): void {
  const toast: Toast = { id: ++toastId, title, body, type }
  listeners.forEach((fn) => fn(toast))
}

export function ToastContainer(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (toast: Toast): void => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 5000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
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
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'bg-card border border-border rounded-lg shadow-xl p-3 flex items-start gap-2 animate-in slide-in-from-bottom-2',
            'transition-all duration-300'
          )}
        >
          {icons[toast.type]}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{toast.title}</div>
            <div className="text-xs text-muted-foreground truncate">{toast.body}</div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-0.5 hover:bg-accent rounded"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
