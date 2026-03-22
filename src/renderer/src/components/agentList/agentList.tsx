import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { CreateAgentDialog } from '@components/CreateAgentDialog'
import { showToast } from '@components/ToastContainer'
import { getInitials } from '@lib/status'
import { cn } from '@lib/utils'
import {
  Inbox,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ExternalLink,
  Plus,
  Archive,
  ArchiveRestore,
  Trash2,
  Monitor
} from 'lucide-react'
import { AgentListSearch } from './agentListSearch'
import { AgentListItem } from './agentListItem'
import { AgentContextMenu } from './agentContextMenu'
import { useAgentListGroups } from './useAgentListGroups'
import type { SortBy } from './useAgentListGroups'

export function AgentList(): JSX.Element {
  const { t } = useTranslation()
  const { agents, setSelectedAgent } = useAppStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForProject, setCreateForProject] = useState<string | null>(null)
  const [createForWorkspaceId, setCreateForWorkspaceId] = useState<string | null>(null)
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('updated')
  const [appVersion, setAppVersion] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('collapsedProjects')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [contextMenu, setContextMenu] = useState<{ agentId: string; x: number; y: number } | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const { machineGroups, attentionAgents, archivedAgents, workspaces } = useAgentListGroups(search, sortBy)

  // Load app version
  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  const toggleProject = (name: string): void => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      localStorage.setItem('collapsedProjects', JSON.stringify([...next]))
      return next
    })
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, agentId: string) => {
    e.preventDefault()
    setContextMenu({ agentId, x: e.clientX, y: e.clientY })
  }, [])

  const handleUnarchiveAgent = useCallback(async (agentId: string) => {
    try {
      await window.api.unarchiveAgent(agentId)
      useAppStore.getState().updateAgentInList(agentId, { status: 'idle' })
      showToast(t('toast.agentRestored', 'Agent restored'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [])

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    const confirmed = await window.api.confirm(t('agent.confirmDelete', 'Permanently delete agent "{{name}}"? This cannot be undone.', { name: agent.name }))
    if (!confirmed) return
    try {
      await window.api.deleteAgent(agentId)
      useAppStore.getState().removeAgent(agentId)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents])

  const handleCreateForProject = (projectName: string, workspaceId?: string): void => {
    setCreateForProject(projectName)
    setCreateForWorkspaceId(workspaceId ?? null)
    setShowCreate(true)
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-card overflow-hidden" role="navigation" aria-label={t('agent.sidebarLabel', 'Agent sidebar')}>
      <AgentListSearch
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onCycleSortBy={() => setSortBy((v) => v === 'updated' ? 'name' : v === 'name' ? 'status' : 'updated')}
        onCreateNew={() => {
          setCreateForProject(null)
          setShowCreate(true)
        }}
        appVersion={appVersion}
      />

      <div className="flex-1 overflow-y-auto" role="list" aria-label={t('agent.listLabel', 'Agent list')}>
        {/* Inbox Section */}
        {attentionAgents.length > 0 && !search && (
          <div className="border-b border-border">
            <button
              onClick={() => setInboxExpanded((v) => !v)}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/30 transition-colors"
            >
              <Inbox size={14} className="text-orange-500 shrink-0" />
              <span className="text-[11px] font-semibold text-foreground flex-1">
                {t('sidebar.inbox')}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400">
                {t('sidebar.attention', { count: attentionAgents.length })}
              </span>
              {inboxExpanded ? (
                <ChevronDown size={12} className="text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight size={12} className="text-muted-foreground shrink-0" />
              )}
            </button>

            {inboxExpanded && (
              <div className="pb-1">
                {attentionAgents.map((agent) => {
                  const isError = agent.status === 'error'
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded-md text-left cursor-pointer transition-colors',
                        isError
                          ? 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20'
                          : 'bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20'
                      )}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          isError ? 'bg-red-500' : 'bg-orange-500'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-medium truncate block">
                          {agent.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground truncate block">
                          {t(`agent.status.${agent.status}`)}
                        </span>
                      </div>
                      <ExternalLink size={12} className={cn(
                        'shrink-0',
                        isError ? 'text-red-500' : 'text-orange-500'
                      )} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Workspaces Section */}
        <div className="px-2.5 pt-2 pb-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('sidebar.workspaces')}
          </span>
        </div>

        {machineGroups.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {agents.filter((a) => a.status !== 'archived').length === 0
              ? t('agent.noAgents')
              : t('common.noResults', '"{{query}}" — no results', { query: search })}
          </div>
        ) : (
          machineGroups.map((machine) => {
            const machineCollapsed = collapsedProjects.has(machine.machineKey)
            const totalAgents = machine.projects.reduce((sum, p) => sum + p.agents.length, 0)
            return (
              <div key={machine.machineKey} className="mb-1">
                {/* Machine header */}
                <div className="flex items-center gap-1 px-1.5 py-1">
                  <button
                    onClick={() => toggleProject(machine.machineKey)}
                    className="flex items-center gap-1 flex-1 min-w-0 rounded px-1 py-0.5 hover:bg-accent/50 transition-colors"
                  >
                    {machineCollapsed ? (
                      <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                    )}
                    {machine.isSSH ? (
                      <span className="text-[8px] px-1 py-0 rounded bg-cyan-500/15 text-cyan-500 font-mono shrink-0">SSH</span>
                    ) : (
                      <Monitor size={11} className="text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                      {machine.machineName}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">
                      {totalAgents}
                    </span>
                  </button>
                </div>

                {/* Projects within this machine */}
                {!machineCollapsed && machine.projects.map((group) => {
                  const isCollapsed = collapsedProjects.has(group.projectName)
                  return (
                    <div key={group.projectName} className="mb-0.5">
                      {/* Project header */}
                      <div className="flex items-center gap-1 px-1.5 py-0.5 group ml-2">
                        <button
                          onClick={() => toggleProject(group.projectName)}
                          className="flex items-center gap-1 flex-1 min-w-0 rounded px-1 py-0.5 hover:bg-accent/50 transition-colors"
                        >
                          {isCollapsed ? (
                            <ChevronRight size={10} className="text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown size={10} className="text-muted-foreground shrink-0" />
                          )}
                          <FolderOpen size={11} className="text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium text-foreground truncate">
                            {group.projectName}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">
                            {group.agents.length}
                          </span>
                        </button>
                        <button
                          onClick={() => handleCreateForProject(group.projectName, group.agents[0]?.workspaceId)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground transition-all"
                          title={t('agent.new')}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Agent entries */}
                      {!isCollapsed &&
                        group.agents.map((agent) => (
                          <AgentListItem
                            key={agent.id}
                            agent={agent}
                            onContextMenu={handleContextMenu}
                          />
                        ))}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <AgentContextMenu
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          workspaces={workspaces}
        />
      )}

      {/* Archived agents section */}
      {archivedAgents.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-1.5 px-2.5 py-1 w-full text-left hover:bg-accent/50 rounded transition-colors"
          >
            {showArchived ? (
              <ChevronDown size={12} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="text-muted-foreground" />
            )}
            <Archive size={12} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('agent.archived', 'Archived')}
            </span>
            <span className="text-[9px] text-muted-foreground ml-auto">{archivedAgents.length}</span>
          </button>
          {showArchived && (
            <div className="space-y-0.5 mt-1">
              {archivedAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded mx-1 bg-secondary/30 group"
                >
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0 opacity-50">
                    {getInitials(agent.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground truncate line-through">{agent.name}</div>
                    <div className="text-[9px] text-muted-foreground/60 truncate">{agent.projectName}</div>
                  </div>
                  <button
                    onClick={() => handleUnarchiveAgent(agent.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all"
                    title={t('agent.actions.restore', 'Restore')}
                  >
                    <ArchiveRestore size={12} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDeleteAgent(agent.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all"
                    title={t('agent.actions.delete', 'Delete')}
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Version info */}
      {appVersion && (
        <div className="px-3 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground/40">
          v{appVersion}
        </div>
      )}

      {showCreate && (
        <CreateAgentDialog
          onClose={() => {
            setShowCreate(false)
            setCreateForProject(null)
            setCreateForWorkspaceId(null)
          }}
          prefill={
            createForProject
              ? {
                  path: '',
                  name: createForProject,
                  detectedFiles: {
                    claudeMd: false,
                    claudeDir: false,
                    agentsMd: false,
                    packageJson: false
                  },
                  claudeMdPreview: null,
                  techStack: [],
                  lastModified: new Date().toISOString()
                }
              : undefined
          }
          workspaceId={createForWorkspaceId ?? undefined}
        />
      )}
    </div>
  )
}
