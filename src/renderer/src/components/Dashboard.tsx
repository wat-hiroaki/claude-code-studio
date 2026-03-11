import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { Users, AlertCircle, XCircle, CheckCircle2 } from 'lucide-react'
import { ActivityLog } from './ActivityLog'
import type { AgentStatus } from '@shared/types'

const statusColors: Record<AgentStatus, string> = {
  creating: 'border-gray-400',
  active: 'border-green-500',
  thinking: 'border-blue-500',
  tool_running: 'border-yellow-500',
  awaiting: 'border-orange-500',
  error: 'border-red-500',
  idle: 'border-gray-400',
  archived: 'border-gray-300'
}

export function Dashboard(): JSX.Element {
  const { t } = useTranslation()
  const { agents, teamStats, setSelectedAgent, toggleDashboard } = useAppStore()

  const handleAgentClick = (id: string): void => {
    setSelectedAgent(id)
    toggleDashboard()
  }

  return (
    <div className="border-b border-border bg-card p-4 space-y-4 max-h-[50vh] overflow-y-auto">
      <h2 className="text-sm font-semibold">{t('dashboard.title')}</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <Users size={20} className="text-green-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.active}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.active')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <AlertCircle size={20} className="text-orange-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.awaiting}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.awaiting')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <XCircle size={20} className="text-red-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.error}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.errors')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-blue-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.completedToday}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.completedToday')}</div>
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => handleAgentClick(agent.id)}
            className={cn(
              'bg-secondary rounded-lg p-3 text-left border-l-4 hover:bg-accent/50 transition-colors',
              statusColors[agent.status]
            )}
          >
            <div className="text-sm font-medium truncate">{agent.name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {t(`agent.status.${agent.status}`)}
            </div>
            {agent.currentTask && (
              <div className="text-[10px] text-muted-foreground mt-1 truncate">
                {agent.currentTask}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Activity Log */}
      <ActivityLog />
    </div>
  )
}
