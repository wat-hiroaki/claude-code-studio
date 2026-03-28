import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { getInitials } from '@lib/status'
import { FolderOpen, Clock, Cpu, Link, Inbox, User, FileText, RotateCw, Square, AlertCircle, Globe, Brain } from 'lucide-react'
import { showToast } from '@components/ToastContainer'
import { TaskChainPanel } from '@components/TaskChainPanel'
import { InboxPanel } from '@components/InboxPanel'
import { AgentProfileView } from '@components/AgentProfileView'
import { BrowserPanel } from '@components/BrowserPanel'
import type { PluginContextTab as PluginTab } from '@shared/types'

type ContextTab = 'details' | 'profile' | 'inbox' | 'chains' | 'browser' | string

export function ContextPane(): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, agents, setSelectedAgent } = useAppStore()
  const [activeTab, setActiveTab] = useState<ContextTab>('details')

  const agent = agents.find((a) => a.id === selectedAgentId)
  const [pluginTabs, setPluginTabs] = useState<PluginTab[]>([])

  useEffect(() => {
    window.api.pluginContextTabs().then(setPluginTabs).catch(() => {})
  }, [])

  const PLUGIN_ICON_MAP: Record<string, typeof Brain> = { brain: Brain, globe: Globe }

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
      <button onClick={() => setActiveTab('browser')} className={tabClass('browser')}>
        <Globe size={12} />
        {t('contextPane.browser', 'Browser')}
      </button>
      {pluginTabs.map(pt => {
        const Icon = PLUGIN_ICON_MAP[pt.icon] || Brain
        return (
          <button key={pt.id} onClick={() => setActiveTab(pt.id)} className={tabClass(pt.id)}>
            <Icon size={12} />
            {pt.label}
          </button>
        )
      })}
    </div>
  )

  if (activeTab === 'profile') {
    return (
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
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
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <InboxPanel onSelectAgent={setSelectedAgent} />
      </div>
    )
  }

  if (activeTab === 'chains') {
    return (
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <TaskChainPanel />
      </div>
    )
  }

  // Plugin tabs
  const activePluginTab = pluginTabs.find(pt => pt.id === activeTab)
  if (activePluginTab) {
    return (
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <div className="p-4 text-sm text-muted-foreground">Plugin: {activePluginTab.label}</div>
      </div>
    )
  }

  if (!agent && activeTab !== 'browser') {
    return (
      <div className="h-full border-l border-border bg-card flex flex-col">
        {renderTabs()}
        <div className="p-4 text-sm text-muted-foreground">
          {t('chat.selectAgent')}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
      {renderTabs()}
      {/* Browser panel — lazy mount on Linux to avoid GPU crashes */}
      {activeTab === 'browser' ? (
        <div className="flex-1 min-h-0">
          <BrowserPanel />
        </div>
      ) : null}
      {activeTab === 'details' && agent && (
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

          {/* System Prompt Preview */}
          {agent.systemPrompt && (
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 text-xs mb-2">
                <FileText size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">{t('agent.systemPrompt', 'System Prompt')}:</span>
              </div>
              <p className="text-[11px] text-muted-foreground bg-secondary/50 rounded p-2 line-clamp-4 font-mono">
                {agent.systemPrompt}
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="p-4 border-b border-border">
            <div className="text-xs text-muted-foreground mb-2">{t('agent.actions.title', 'Actions')}:</div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await window.api.ptyInterrupt(agent.id)
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), 'error')
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 transition-colors"
              >
                <AlertCircle size={11} />
                Interrupt
              </button>
              <button
                onClick={async () => {
                  try {
                    await window.api.ptyStop(agent.id)
                    await window.api.ptyStart(agent.id)
                    showToast(t('toast.agentRestarted', 'Agent restarted'), 'success')
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), 'error')
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
              >
                <RotateCw size={11} />
                Restart
              </button>
              <button
                onClick={async () => {
                  try {
                    await window.api.ptyStop(agent.id)
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), 'error')
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <Square size={11} />
                Stop
              </button>
            </div>
          </div>

          {/* Session Meta */}
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">{t('profile.created', 'Created')}:</span>
              <span>{new Date(agent.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-muted-foreground">{t('profile.updated', 'Updated')}:</span>
              <span>{new Date(agent.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
