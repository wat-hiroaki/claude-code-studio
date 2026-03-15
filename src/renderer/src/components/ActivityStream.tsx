import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Activity, Zap, CheckCircle, AlertCircle, Clock, TerminalSquare, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'

interface ActivityEvent {
  id: number
  agentId: string
  agentName: string
  workspaceId?: string
  type: 'tool_use' | 'thinking' | 'complete' | 'error' | 'output'
  content: string
  timestamp: Date
}

const MAX_EVENTS = 200
let eventIdCounter = 0

const TYPE_STYLES: Record<string, { icon: typeof Zap; color: string; glow: string }> = {
  tool_use: { icon: Zap, color: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
  thinking: { icon: Clock, color: 'text-purple-400', glow: 'shadow-purple-500/20' },
  complete: { icon: CheckCircle, color: 'text-green-400', glow: 'shadow-green-500/20' },
  error: { icon: AlertCircle, color: 'text-red-400', glow: 'shadow-red-500/20' },
  output: { icon: TerminalSquare, color: 'text-blue-400', glow: 'shadow-blue-500/20' }
}

// Strip ANSI escape sequences from PTY output
const stripAnsi = (str: string): string =>
  str
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

export function ActivityStream({ className, onAgentClick }: { className?: string; onAgentClick?: (id: string) => void }): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterType, setFilterType] = useState<ActivityEvent['type'] | 'all'>('all')
  const [filterWorkspace, setFilterWorkspace] = useState<string | 'all'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const agents = useAppStore((s) => s.agents)

  // Get unique workspace IDs
  const workspaces = useMemo(() => {
    const ids = new Set<string>()
    agents.forEach((a) => {
      if (a.workspaceId) ids.add(a.workspaceId)
    })
    return Array.from(ids)
  }, [agents])

  // Parse PTY output + status changes into activity events
  useEffect(() => {
    const pushEvent = (evt: ActivityEvent): void => {
      setEvents((prev) => {
        const next = [...prev, evt]
        if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS)
        return next
      })
    }

    const unsubOutput = window.api.onAgentOutput((agentId, message) => {
      const agent = agents.find((a) => a.id === agentId)
      const name = agent?.name ?? agentId.slice(0, 8)

      let type: ActivityEvent['type'] = 'output'
      let content = ''

      if (message.contentType === 'tool_exec') {
        type = 'tool_use'
        content = stripAnsi(message.content).slice(0, 120)
      } else if (message.contentType === 'code') {
        type = 'complete'
        content = stripAnsi(message.content).slice(0, 80)
      } else if (message.role === 'agent' && message.contentType === 'text') {
        type = 'thinking'
        content = stripAnsi(message.content).slice(0, 80)
      } else if (message.contentType === 'error') {
        type = 'error'
        content = stripAnsi(message.content).slice(0, 100)
      } else if (message.contentType === 'text') {
        content = stripAnsi(message.content).slice(0, 100)
      }

      if (!content.trim()) return

      pushEvent({
        id: ++eventIdCounter,
        agentId,
        agentName: name,
        workspaceId: agent?.workspaceId ?? undefined,
        type,
        content: content.replace(/\n/g, ' ').trim(),
        timestamp: new Date()
      })
    })

    const unsubStatus = window.api.onAgentStatusChange((agentId, status) => {
      if (!['idle', 'error', 'awaiting'].includes(status)) return
      const agent = agents.find((a) => a.id === agentId)
      const name = agent?.name ?? agentId.slice(0, 8)
      const typeMap: Record<string, ActivityEvent['type']> = { idle: 'complete', error: 'error', awaiting: 'output' }
      const labelMap: Record<string, string> = { idle: 'Task completed', error: 'Error occurred', awaiting: 'Approval required' }
      pushEvent({
        id: ++eventIdCounter,
        agentId,
        agentName: name,
        workspaceId: agent?.workspaceId ?? undefined,
        type: typeMap[status] ?? 'output',
        content: labelMap[status] ?? status,
        timestamp: new Date()
      })
    })

    return () => { unsubOutput(); unsubStatus() }
  }, [agents])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

  const formatTime = (d: Date): string => {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterType !== 'all' && e.type !== filterType) return false
      if (filterWorkspace !== 'all' && e.workspaceId !== filterWorkspace) return false
      return true
    })
  }, [events, filterType, filterWorkspace])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Activity size={14} className="text-primary animate-pulse" />
        <span className="text-xs font-medium">Activity Stream</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {filteredEvents.length}/{events.length}
        </span>
        <div className={cn(
          'w-1.5 h-1.5 rounded-full',
          events.length > 0 ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/30'
        )} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/30 overflow-x-auto">
        <Filter size={10} className="text-muted-foreground shrink-0" />
        {/* Type filter */}
        {(['all', 'tool_use', 'thinking', 'complete', 'error'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              'text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap transition-colors',
              filterType === type ? 'bg-primary/20 text-primary' : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            {type === 'all' ? 'All' : type.replace('_', ' ')}
          </button>
        ))}
        {/* Workspace filter */}
        {workspaces.length > 1 && (
          <>
            <div className="w-px h-3 bg-border/50 mx-0.5" />
            <select
              value={filterWorkspace}
              onChange={(e) => setFilterWorkspace(e.target.value)}
              className="text-[9px] bg-transparent border border-border/30 rounded px-1 py-0.5 text-muted-foreground outline-none"
            >
              <option value="all">All WS</option>
              {workspaces.map((ws) => (
                <option key={ws} value={ws}>{ws.split('/').pop()}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border"
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
            <Activity size={24} className="mb-2" />
            <span className="text-xs">Waiting for agent activity...</span>
          </div>
        ) : (
          <div className="p-1">
            {filteredEvents.map((evt) => {
              const style = TYPE_STYLES[evt.type] ?? TYPE_STYLES.output
              const Icon = style.icon
              return (
                <div
                  key={evt.id}
                  onClick={() => onAgentClick?.(evt.agentId)}
                  className={cn(
                    'flex items-start gap-2 px-2 py-1 rounded text-[11px] transition-colors hover:bg-muted/30',
                    'animate-in fade-in slide-in-from-left-2 duration-200',
                    onAgentClick && 'cursor-pointer'
                  )}
                >
                  <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0 mt-0.5 w-[52px]">
                    {formatTime(evt.timestamp)}
                  </span>
                  <Icon size={11} className={cn(style.color, 'shrink-0 mt-0.5')} />
                  <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-[60px] truncate">
                    {evt.agentName}
                  </span>
                  <span className="text-muted-foreground/80 truncate min-w-0 font-mono">
                    {evt.content}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Scanline effect (SF aesthetic) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-primary/[0.02]" />
    </div>
  )
}
