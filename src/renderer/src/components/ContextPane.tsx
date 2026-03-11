import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { FolderOpen, Clock, Cpu, Link } from 'lucide-react'
import { TaskChainPanel } from './TaskChainPanel'

type ContextTab = 'details' | 'chains'

export function ContextPane(): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, agents } = useAppStore()
  const [activeTab, setActiveTab] = useState<ContextTab>('details')

  const agent = agents.find((a) => a.id === selectedAgentId)

  if (!agent) {
    return (
      <div className="w-80 border-l border-border bg-card flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'details' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t('contextPane.details')}
          </button>
          <button
            onClick={() => setActiveTab('chains')}
            className={`flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${activeTab === 'chains' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Link size={12} />
            {t('chain.title')}
          </button>
        </div>

        {activeTab === 'details' ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t('chat.selectAgent')}
          </div>
        ) : (
          <TaskChainPanel />
        )}
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'details' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('contextPane.details')}
        </button>
        <button
          onClick={() => setActiveTab('chains')}
          className={`flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${activeTab === 'chains' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Link size={12} />
          {t('chain.title')}
        </button>
      </div>

      {activeTab === 'chains' ? (
        <TaskChainPanel />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Agent Profile */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-medium">
                {agent.name.slice(0, 2).toUpperCase()}
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

          {/* Session Meta */}
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{new Date(agent.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
