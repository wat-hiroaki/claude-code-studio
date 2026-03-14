import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Wrench,
  MessageSquare,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import type { AgentStatus } from '@shared/types'

type ActivityEventType = 'completed' | 'error' | 'tool' | 'message'

interface ActivityEvent {
  id: number
  timestamp: string
  agentId: string
  agentName: string
  eventType: ActivityEventType
  summary: string
}

const MAX_EVENTS = 100

const eventIcons: Record<ActivityEventType, typeof CheckCircle2> = {
  completed: CheckCircle2,
  error: XCircle,
  tool: Wrench,
  message: MessageSquare
}

const eventColors: Record<ActivityEventType, string> = {
  completed: 'text-green-500',
  error: 'text-red-500',
  tool: 'text-yellow-500',
  message: 'text-blue-500'
}

export function ActivityLog(): JSX.Element {
  const { t } = useTranslation()
  const { agents, setSelectedAgent, toggleDashboard } = useAppStore()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [filterType, setFilterType] = useState<ActivityEventType | 'all'>('all')
  const nextIdRef = useRef(1)

  const getAgentName = useCallback(
    (agentId: string): string => {
      return agents.find((a) => a.id === agentId)?.name ?? agentId.slice(0, 8)
    },
    [agents]
  )

  const addEvent = useCallback(
    (agentId: string, eventType: ActivityEventType, summary: string) => {
      setEvents((prev) => {
        const newEvent: ActivityEvent = {
          id: nextIdRef.current++,
          timestamp: new Date().toISOString(),
          agentId,
          agentName: getAgentName(agentId),
          eventType,
          summary
        }
        const updated = [newEvent, ...prev]
        if (updated.length > MAX_EVENTS) {
          return updated.slice(0, MAX_EVENTS)
        }
        return updated
      })
    },
    [getAgentName]
  )

  // Map status changes to activity events
  const mapStatusToEvent = useCallback(
    (agentId: string, status: AgentStatus) => {
      switch (status) {
        case 'idle':
          addEvent(agentId, 'completed', t('activity.events.taskCompleted'))
          break
        case 'error':
          addEvent(agentId, 'error', t('activity.events.errorOccurred'))
          break
        case 'tool_running':
          addEvent(agentId, 'tool', t('activity.events.toolRunning'))
          break
        case 'active':
          // Only log when transitioning from creating to active
          break
        default:
          break
      }
    },
    [addEvent, t]
  )

  useEffect(() => {
    const unsubStatus = window.api.onAgentStatusChange((agentId, status) => {
      mapStatusToEvent(agentId, status)
    })

    const unsubOutput = window.api.onAgentOutput((agentId, message) => {
      // Strip ANSI escape sequences from PTY output
      const strip = (s: string): string =>
        s
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b\][^\x07]*\x07/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/\x1b[>=<][0-9]*[a-zA-Z]?/g, '')
          // eslint-disable-next-line no-control-regex
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

      if (message.contentType === 'tool_exec') {
        const toolName = strip(message.content.split('\n')[0]?.replace(/[[\]]/g, '') ?? 'tool')
        addEvent(agentId, 'tool', `${t('activity.events.toolExec')}: ${toolName}`)
      } else if (message.contentType === 'error') {
        addEvent(agentId, 'error', strip(message.content).slice(0, 80))
      } else if (message.role === 'agent' && message.contentType === 'text') {
        const cleaned = strip(message.content)
        const preview = cleaned.slice(0, 60)
        addEvent(agentId, 'message', preview + (cleaned.length > 60 ? '...' : ''))
      }
    })

    return () => {
      unsubStatus()
      unsubOutput()
    }
  }, [mapStatusToEvent, addEvent, t])

  const handleEventClick = (agentId: string): void => {
    setSelectedAgent(agentId)
    toggleDashboard()
  }

  const formatTime = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="border-t border-border bg-card">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          <span className="text-xs font-semibold">{t('activity.title')}</span>
          <span className="text-[10px] text-muted-foreground">
            ({events.length})
          </span>
        </div>
        {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Filter Bar + Event List */}
      {!isCollapsed && (
        <div>
          <div className="flex items-center gap-1 px-4 py-1 border-t border-border/50">
            {(['all', 'completed', 'error', 'tool', 'message'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                  filterType === type ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {type === 'all' ? t('common.all', 'All') : t(`activity.type.${type}`)}
              </button>
            ))}
          </div>
        <div className="max-h-[200px] overflow-y-auto">
          {events.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center">
              {t('activity.empty')}
            </div>
          )}

          {events.filter((e) => filterType === 'all' || e.eventType === filterType).map((event) => {
            const Icon = eventIcons[event.eventType]
            return (
              <button
                key={event.id}
                onClick={() => handleEventClick(event.agentId)}
                className="w-full flex items-start gap-2 px-4 py-2 text-left hover:bg-accent/30 transition-colors border-t border-border/50"
              >
                {/* Timeline dot */}
                <div className="flex-shrink-0 mt-0.5">
                  <Icon size={12} className={cn(eventColors[event.eventType])} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium">{event.agentName}</span>
                    <span className="text-[10px] px-1 py-0 rounded bg-secondary text-muted-foreground">
                      {t(`activity.type.${event.eventType}`)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {event.summary}
                  </p>
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatTime(event.timestamp)}
                </span>
              </button>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}
