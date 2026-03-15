import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { Calendar, Clock, PlayCircle, PauseCircle, History } from 'lucide-react'
import type { TaskChain, ChainExecutionLog } from '@shared/types'

function formatInterval(chain: TaskChain, t: (key: string) => string): string {
  const { triggerCondition } = chain
  if (triggerCondition.intervalMinutes != null) {
    const mins = triggerCondition.intervalMinutes
    if (mins >= 1440) {
      return t('scheduler.daily')
    }
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      return `${t('scheduler.every')} ${hours} ${t('scheduler.hours')}`
    }
    return `${t('scheduler.every')} ${mins} ${t('scheduler.minutes')}`
  }
  if (triggerCondition.cronExpression) {
    return triggerCondition.cronExpression
  }
  return t('scheduler.daily')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const POLL_INTERVAL = 15_000

export function ScheduledTasksPanel(): JSX.Element {
  const { t } = useTranslation()
  const { agents } = useAppStore()
  const [scheduledChains, setScheduledChains] = useState<TaskChain[]>([])
  const [executionLogs, setExecutionLogs] = useState<ChainExecutionLog[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getAgentName = useCallback(
    (id: string): string => {
      return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8)
    },
    [agents]
  )

  const fetchData = useCallback(async () => {
    try {
      const [chains, logs] = await Promise.all([
        window.api.getScheduledChains(),
        window.api.getChainExecutionLogs(20)
      ])
      setScheduledChains(chains)
      setExecutionLogs(logs)
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchData])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Calendar size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">{t('scheduler.title')}</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Active Schedules Section */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-1.5 mb-3">
            <Clock size={14} className="text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('scheduler.activeSchedules')}
            </h4>
            <span className="text-[10px] text-muted-foreground">({scheduledChains.length})</span>
          </div>

          {scheduledChains.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('scheduler.noSchedules')}
            </p>
          ) : (
            <div className="space-y-2">
              {scheduledChains.map((chain) => (
                <div
                  key={chain.id}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 border border-border',
                    !chain.isActive && 'opacity-50'
                  )}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {chain.isActive ? (
                      <PlayCircle size={16} className="text-green-500" />
                    ) : (
                      <PauseCircle size={16} className="text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{chain.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px]">
                        {formatInterval(chain, t)}
                      </span>
                      <span className="truncate">→ {getAgentName(chain.targetAgentId)}</span>
                    </div>
                  </div>

                  {/* Active/Paused badge */}
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      chain.isActive
                        ? 'bg-green-500/15 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {chain.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Executions Section */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <History size={14} className="text-muted-foreground" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('scheduler.recentExecutions')}
            </h4>
          </div>

          {executionLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('activity.empty')}
            </p>
          ) : (
            <div className="space-y-1">
              {executionLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/40 transition-colors"
                >
                  {/* Status dot */}
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      log.status === 'completed' && 'bg-green-500',
                      log.status === 'running' && 'bg-blue-500 animate-pulse',
                      log.status === 'error' && 'bg-red-500'
                    )}
                  />

                  {/* Log info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{log.chainName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {getAgentName(log.triggerAgentId)} → {getAgentName(log.targetAgentId)}
                      {log.errorMessage && (
                        <span className="text-red-400 ml-1">— {log.errorMessage}</span>
                      )}
                    </div>
                  </div>

                  {/* Time & Duration */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">
                      {formatTime(log.startedAt)}
                    </div>
                    {log.durationMs != null && (
                      <div className="text-[10px] text-muted-foreground">
                        {formatDuration(log.durationMs)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
