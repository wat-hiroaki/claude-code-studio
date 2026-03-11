import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { getInitials } from '../lib/status'
import { FolderOpen, Clock, Cpu, Link, Inbox, User } from 'lucide-react'
import { TaskChainPanel } from './TaskChainPanel'
import { InboxPanel } from './InboxPanel'
import { AgentProfileView } from './AgentProfileView'

type ContextTab = 'details' | 'profile' | 'inbox' | 'chains'

export function ContextPane(): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, agents, setSelectedAgent } = useAppStore()
  const [activeTab, setActiveTab] = useState<ContextTab>('details')

  const agent = agents.find((a) => a.id === selectedAgentId)

  const tabClass = (tab: ContextTab): string =>
    `flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
      activeTab === tab
        ? 'border-b-2 border-primary text-foreground'
        : 'text-muted-foreground hover:text-foreground'
    }`

  const renderTabs = (): JSX.Element => (
    <div className="flex border-b border-border">
      <button onClick={() => setActiveTab('details')} className={tabClass('details')}>
        {t('contextPane.details')}
      </button>
      <button onClick={() => setActiveTab('profile')} className={tabClass('profile')}>
        <User size={12} />
        {t('profile.tab', 'Profile')}
      </button>
      <button onClick={() => setActiveTab('inbox')} className={tabClass('inbox')}>
        <Inbox size={12} />
        {t('inbox.title')}
      </button>
      <button onClick={() => setActiveTab('chains')} className={tabClass('chains')}>
        <Link size={12} />
        {t('chain.title')}
      </button>
    </div>
  )

  if (activeTab === 'profile') {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        {agent ? (
          <AgentProfileView
            agentId={agent.id}
            agentName={agent.name}
            onClose={() => setActiveTab('details')}
          />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {t('chat.selectAgent')}
          </div>
        )}
      </div>
    )
  }

  if (activeTab === 'inbox') {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <InboxPanel onSelectAgent={setSelectedAgent} />
      </div>
    )
  }

  if (activeTab === 'chains') {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <TaskChainPanel />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col">
        {renderTabs()}
        <div className="p-4 text-sm text-muted-foreground">
          {t('chat.selectAgent')}
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
      {renderTabs()}
      <div className="flex-1 overflow-y-auto">
        {/* Agent Profile */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-medium">
              {getInitials(agent.name)}
            </div>
            <div>
              <div className="font-medium">{agent.name} #{agent.sessionNumber}</div>
              {agent.roleLabel && (
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                  {agent.roleLabel}
                </span>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {t(`agent.status.${agent.status}`)}
          </div>
        </div>

        {/* Project Info */}
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <FolderOpen size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">{t('agent.project')}:</span>
            <span className="font-mono truncate">{agent.projectName}</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground truncate pl-6">
            {agent.projectPath}
          </div>
        </div>

        {/* Current Task */}
        {agent.currentTask && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 text-xs mb-2">
              <Cpu size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">{t('agent.currentTask')}:</span>
            </div>
            <p className="text-sm">{agent.currentTask}</p>
          </div>
        )}

        {/* Skills */}
        {agent.skills.length > 0 && (
          <div className="p-4 border-b border-border">
            <div className="text-xs text-muted-foreground mb-2">{t('agent.skills')}:</div>
            <div className="flex flex-wrap gap-1">
              {agent.skills.map((skill) => (
                <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reports To */}
        {agent.reportTo && (() => {
          const manager = agents.find((a) => a.id === agent.reportTo)
          return manager ? (
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 text-xs">
                <User size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">{t('agent.reportsTo')}:</span>
                <button
                  onClick={() => setSelectedAgent(manager.id)}
                  className="text-primary hover:underline"
                >
                  {manager.name}
                </button>
              </div>
            </div>
          ) : null
        })()}

        {/* Session Meta */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span>{new Date(agent.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground">Updated:</span>
            <span>{new Date(agent.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
