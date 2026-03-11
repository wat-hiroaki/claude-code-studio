import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { CreateAgentDialog } from './CreateAgentDialog'
import { Plus, Search } from 'lucide-react'
import { cn } from '../lib/utils'
import { getStatusDot, getInitials } from '../lib/status'

export function AgentList(): JSX.Element {
  const { t } = useTranslation()
  const { agents, selectedAgentId, setSelectedAgent, messages } = useAppStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const activeAgents = agents.filter((a) => a.status !== 'archived')
  const archivedAgents = agents.filter((a) => a.status === 'archived')

  const filtered = activeAgents.filter((a) => {
    const q = search.toLowerCase()
    return (
      a.name.toLowerCase().includes(q) ||
      a.projectName.toLowerCase().includes(q) ||
      (a.roleLabel?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="flex flex-col w-64 min-w-[220px] max-w-[320px] border-r border-border bg-card resize-x overflow-hidden">
      {/* Header */}
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agents</span>
          <button
            onClick={() => setShowCreate(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
            title={t('agent.new')}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-secondary rounded border-none outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Agent List — LINE style */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {activeAgents.length === 0 ? t('agent.noAgents') : `"${search}" — no results`}
          </div>
        ) : (
          filtered.map((agent) => {
            const agentMsgs = messages[agent.id] || []
            const lastMsg = agentMsgs[agentMsgs.length - 1]
            const lastMsgPreview = lastMsg
              ? lastMsg.role === 'manager'
                ? `You: ${lastMsg.content}`
                : lastMsg.content
              : t(`agent.status.${agent.status}`)

            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-accent/50 border-b border-border/50',
                  selectedAgentId === agent.id && 'bg-accent'
                )}
              >
                {/* Avatar + status */}
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {getInitials(agent.name)}
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                    getStatusDot(agent.status)
                  )} />
                </div>

                {/* Name + last message preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium truncate">{agent.name}</span>
                    {lastMsg && (
                      <span className="text-[9px] text-muted-foreground shrink-0 ml-1">
                        {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {lastMsgPreview}
                  </p>
                </div>
              </button>
            )
          })
        )}

        {/* Archived section */}
        {archivedAgents.length > 0 && !search && (
          <div className="mt-2">
            <div className="px-2.5 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('agent.status.archived')} ({archivedAgents.length})
            </div>
            {archivedAgents.slice(0, 3).map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left opacity-50 hover:opacity-70 transition-opacity"
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px]">
                  {getInitials(agent.name)}
                </div>
                <span className="text-[11px] truncate">{agent.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateAgentDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
