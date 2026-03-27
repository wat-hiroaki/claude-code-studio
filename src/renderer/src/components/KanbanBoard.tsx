import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { cn } from '@lib/utils'
import { getInitials } from '@lib/status'
import { useMemo } from 'react'
import type { Agent, AgentStatus } from '@shared/types'

// Map agent status to kanban column
type KanbanColumn = 'idle' | 'working' | 'needs_attention'

const statusToColumn: Record<AgentStatus, KanbanColumn> = {
  creating: 'idle',
  idle: 'idle',
  active: 'working',
  thinking: 'working',
  tool_running: 'working',
  awaiting: 'needs_attention',
  error: 'needs_attention',
  session_conflict: 'needs_attention',
  archived: 'idle' // filtered out anyway
}

const columns: { key: KanbanColumn; color: string; labelKey: string }[] = [
  { key: 'idle', color: 'border-gray-500', labelKey: 'Idle / Ready' },
  { key: 'working', color: 'border-emerald-500', labelKey: 'Working' },
  { key: 'needs_attention', color: 'border-orange-500', labelKey: 'Needs Attention' }
]

const statusDotColor: Partial<Record<AgentStatus, string>> = {
  active: 'bg-emerald-400',
  thinking: 'bg-blue-400',
  tool_running: 'bg-amber-400',
  awaiting: 'bg-orange-400',
  error: 'bg-red-500',
  session_conflict: 'bg-purple-400',
  idle: 'bg-gray-500',
  creating: 'bg-gray-400'
}

function AgentCard({ agent, onClick }: { agent: Agent; onClick: (id: string) => void }): JSX.Element {
  const { t } = useTranslation()

  return (
    <button
      onClick={() => onClick(agent.id)}
      className="w-full text-left p-2 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors mb-1.5 cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-medium shrink-0">
          {getInitials(agent.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate">{agent.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className={cn('w-1.5 h-1.5 rounded-full', statusDotColor[agent.status] || 'bg-gray-500')} />
            <span className="text-[9px] text-muted-foreground">
              {t(`status.${agent.status}`, agent.status)}
            </span>
          </div>
        </div>
      </div>
      {agent.currentTask && (
        <div className="text-[9px] text-muted-foreground mt-1 truncate pl-8">
          {agent.currentTask}
        </div>
      )}
    </button>
  )
}

export function KanbanBoard(): JSX.Element {
  const { agents, setSelectedAgent } = useAppStore()

  const activeAgents = useMemo(
    () => agents.filter((a) => a.status !== 'archived'),
    [agents]
  )

  const grouped = useMemo(() => {
    const map: Record<KanbanColumn, Agent[]> = { idle: [], working: [], needs_attention: [] }
    for (const agent of activeAgents) {
      const col = statusToColumn[agent.status] || 'idle'
      map[col].push(agent)
    }
    return map
  }, [activeAgents])

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map(({ key, color, labelKey }) => {
        const colAgents = grouped[key]
        return (
          <div
            key={key}
            className={cn('flex-1 min-w-[180px] rounded-lg bg-secondary/50 border-t-2 flex flex-col', color)}
          >
            <div className="p-2 flex items-center justify-between">
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-background/50">
                {labelKey}
              </span>
              <span className="text-[10px] text-muted-foreground">{colAgents.length}</span>
            </div>
            <div className="p-1.5 min-h-[60px] flex-1">
              {colAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onClick={setSelectedAgent} />
              ))}
              {colAgents.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-4 opacity-50">—</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
