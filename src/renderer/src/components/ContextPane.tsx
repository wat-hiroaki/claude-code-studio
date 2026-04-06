import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { getInitials } from '@lib/status'
import { FolderOpen, Clock, Cpu, Link, StickyNote, User, FileText, RotateCw, Square, AlertCircle, Globe, Brain, Zap, Plug, Shield, Filter, X } from 'lucide-react'
import { cn } from '@lib/utils'
import { showToast } from '@components/ToastContainer'
import { TaskChainPanel } from '@components/TaskChainPanel'
import { NotesPanel } from '@components/NotesPanel'
import { useAgentProfile, SectionHeader, RuleItem, SkillItem } from '@components/AgentProfileView'
import { BrowserPanel } from '@components/BrowserPanel'
import type { PluginContextTab as PluginTab } from '@shared/types'

type ContextTab = 'details' | 'notes' | 'chains' | 'browser' | string

export function ContextPane(): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, agents, setSelectedAgent } = useAppStore()
  const [activeTab, setActiveTab] = useState<ContextTab>('details')

  const agent = agents.find((a) => a.id === selectedAgentId)
  const profileHook = useAgentProfile(agent?.id)
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
      <button onClick={() => setActiveTab('notes')} className={tabClass('notes')}>
        <StickyNote size={12} />
        {t('notes.tab', 'Notes')}
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

  if (activeTab === 'notes') {
    return (
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {renderTabs()}
        <NotesPanel />
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
        profileHook.viewingFile ? (
          /* File viewer overlay */
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/60">
              <span className="text-xs font-mono truncate">{profileHook.viewingFile.path.split(/[/\\]/).pop()}</span>
              <button onClick={() => profileHook.setViewingFile(null)} className="p-1 rounded hover:bg-muted/50">
                <X size={12} />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
              {profileHook.viewingFile.content}
            </pre>
          </div>
        ) : (
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
          <div className="p-4 border-b border-border space-y-2">
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

          {/* Profile Sections (merged from Profile tab) */}
          {profileHook.profile && (
            <div className="border-t border-border">
              {/* Rules (CLAUDE.md) */}
              <SectionHeader
                icon={FileText}
                title={t('profile.rules', 'Rules (CLAUDE.md)')}
                count={profileHook.profile.rules.length}
                expanded={profileHook.expanded.rules}
                onToggle={() => profileHook.toggleSection('rules')}
              />
              {profileHook.expanded.rules && (
                <div className="pb-1">
                  {profileHook.profile.rules.length === 0 ? (
                    <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noRules', 'No CLAUDE.md files found')}</p>
                  ) : (
                    profileHook.profile.rules.map((rule) => (
                      <RuleItem key={rule.path} rule={rule} onView={profileHook.handleViewFile} />
                    ))
                  )}
                </div>
              )}

              {/* Memory */}
              <SectionHeader
                icon={Brain}
                title={t('profile.memory', 'Memory')}
                count={profileHook.profile.memory.length}
                expanded={profileHook.expanded.memory}
                onToggle={() => profileHook.toggleSection('memory')}
              />
              {profileHook.expanded.memory && (
                <div className="pb-1">
                  {profileHook.profile.memory.length === 0 ? (
                    <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noMemory', 'No memory files')}</p>
                  ) : (
                    profileHook.profile.memory.map((mem) => (
                      <div key={mem.file} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20">
                        <Brain size={10} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-mono truncate block">{mem.file}</span>
                          <span className="text-[9px] text-muted-foreground">
                            {mem.lineCount} lines · {mem.lastModified ? new Date(mem.lastModified).toLocaleDateString() : 'unknown'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Skills & Commands */}
              <SectionHeader
                icon={Zap}
                title={t('profile.skills', 'Skills & Commands')}
                count={profileHook.profile.skills.length}
                expanded={profileHook.expanded.skills}
                onToggle={() => profileHook.toggleSection('skills')}
              />
              {profileHook.expanded.skills && (
                <div className="pb-1">
                  {profileHook.profile.skills.length === 0 ? (
                    <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noSkills', 'No skills or commands')}</p>
                  ) : (
                    profileHook.profile.skills.map((skill) => (
                      <SkillItem key={skill.path} skill={skill} />
                    ))
                  )}
                </div>
              )}

              {/* MCP Servers */}
              <SectionHeader
                icon={Plug}
                title={t('profile.mcp', 'MCP Servers')}
                count={profileHook.profile.mcpServers.length}
                expanded={profileHook.expanded.mcp}
                onToggle={() => profileHook.toggleSection('mcp')}
              />
              {profileHook.expanded.mcp && (
                <div className="pb-1">
                  {(() => {
                    const filter = agent?.mcpServerFilter
                    const isFiltered = filter?.enabled && filter.allowedServers.length > 0
                    const allowedSet = isFiltered ? new Set(filter.allowedServers) : null
                    return (
                      <>
                        {isFiltered && (
                          <div className="flex items-center gap-1.5 px-4 py-1 text-[10px] text-cyan-400">
                            <Filter size={10} />
                            {t('mcp.filterActive', 'Allowlist active ({{count}} servers)', { count: filter.allowedServers.length })}
                          </div>
                        )}
                        {profileHook.profile.mcpServers.length === 0 ? (
                          <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noMcp', 'No MCP servers configured')}</p>
                        ) : (
                          profileHook.profile.mcpServers.map((server) => {
                            const isAllowed = !allowedSet || allowedSet.has(server.name)
                            return (
                              <div key={server.name} className={cn(
                                'flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20',
                                !isAllowed && 'opacity-35'
                              )}>
                                <div className={cn(
                                  'w-1.5 h-1.5 rounded-full shrink-0',
                                  isAllowed && server.enabled ? 'bg-green-400' : 'bg-muted-foreground/30'
                                )} />
                                <span className="text-[11px] font-medium">{server.name}</span>
                                <span className="text-[9px] text-muted-foreground font-mono truncate">
                                  {server.command}
                                </span>
                                {allowedSet && !isAllowed && (
                                  <span className="text-[9px] text-muted-foreground/50 ml-auto">{t('mcp.filtered', 'filtered')}</span>
                                )}
                              </div>
                            )
                          })
                        )}
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Hooks / Guardrails */}
              <SectionHeader
                icon={Shield}
                title={t('profile.hooks', 'Guardrails & Hooks')}
                count={profileHook.profile.hooks.length}
                expanded={profileHook.expanded.hooks}
                onToggle={() => profileHook.toggleSection('hooks')}
              />
              {profileHook.expanded.hooks && (
                <div className="pb-1">
                  {profileHook.profile.hooks.length === 0 ? (
                    <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noHooks', 'No hooks configured')}</p>
                  ) : (
                    profileHook.profile.hooks.map((hook, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20">
                        <Shield size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400">
                          {hook.event}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate">
                          {hook.command}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )
      )}
    </div>
  )
}
