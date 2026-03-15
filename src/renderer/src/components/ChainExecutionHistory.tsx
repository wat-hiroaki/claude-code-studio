import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ChainExecutionLog } from '@shared/types'

const statusIcons = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle
} as const

const statusColors = {
  running: 'text-blue-500',
  completed: 'text-green-500',
  error: 'text-red-500'
} as const

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then

  if (diffMs < 0) return 'now'

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function ChainExecutionHistory({ limit, chainId }: { limit?: number; chainId?: string }): JSX.Element {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<ChainExecutionLog[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const data = await window.api.getChainExecutionLogs(chainId ? 100 : (limit ?? 20))
      setLogs(chainId ? data.filter(l => l.chainId === chainId).slice(0, limit ?? 20) : data)
    } catch {
      // silently ignore fetch errors
    }
  }, [limit, chainId])

  useEffect(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, 10_000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchLogs])

  return (
    <div className="flex flex-col border border-border rounded-lg bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Clock size={14} className="text-primary" />
        <span className="text-xs font-semibold">{t('executionHistory.title')}</span>
        <span className="text-[10px] text-muted-foreground">({logs.length})</span>
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto">
        {logs.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            {t('executionHistory.empty')}
          </div>
        )}

        {logs.map((log) => {
          const Icon = statusIcons[log.status]
          const isRunning = log.status === 'running'

          return (
            <div
              key={log.id}
              className="flex items-start gap-2 px-4 py-2 border-b border-border/50 last:border-b-0"
            >
              {/* Status icon */}
              <div className="flex-shrink-0 mt-0.5">
                <Icon
                  size={14}
                  className={cn(
                    statusColors[log.status],
                    isRunning && 'animate-spin'
                  )}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium truncate">
                    {log.chainName}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] px-1 py-0 rounded',
                      log.status === 'completed' && 'bg-green-500/10 text-green-500',
                      log.status === 'error' && 'bg-red-500/10 text-red-500',
                      log.status === 'running' && 'bg-blue-500/10 text-blue-500'
                    )}
                  >
                    {t(`executionHistory.${log.status}`)}
                  </span>
                </div>

                {/* Duration */}
                {log.status === 'completed' && log.durationMs != null && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('executionHistory.duration')}: {formatDuration(log.durationMs)}
                  </p>
                )}

                {/* Error message */}
                {log.status === 'error' && log.errorMessage && (
                  <p className="text-[10px] text-red-400 truncate mt-0.5">
                    {log.errorMessage.length > 100
                      ? log.errorMessage.slice(0, 100) + '...'
                      : log.errorMessage}
                  </p>
                )}
              </div>

              {/* Relative time */}
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {formatRelativeTime(log.startedAt)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
