import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { CreateAgentDialog } from './CreateAgentDialog'
import { AgentAvatar } from './AgentAvatar'
import { EmojiPicker } from './EmojiPicker'
import { showToast } from './ToastContainer'
import {
  Plus,
  Search,
  Inbox,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ExternalLink,
  RotateCw,
  Archive,
  ArchiveRestore,
  Copy,
  Pin,
  PinOff,
  Download,
  ArrowUpDown
} from 'lucide-react'
import { Smile } from 'lucide-react'
import { cn } from '../lib/utils'
import { getStatusDot, getInitials } from '../lib/status'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import type { Agent } from '@shared/types'

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface ProjectGroup {
  projectName: string
  agents: Agent[]
}

interface MachineGroup {
  machineKey: string
  machineName: string
  isSSH: boolean
  sshHost?: string
  projects: ProjectGroup[]
}

export function AgentList(): JSX.Element {
  const { t } = useTranslation()
  const { agents, selectedAgentId, setSelectedAgent, messages, activeWorkspaceId } = useAppStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForProject, setCreateForProject] = useState<string | null>(null)
  const [createForWorkspaceId, setCreateForWorkspaceId] = useState<string | null>(null)
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'updated'>('updated')
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
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<string | null>(null)
  const emojiAnchorRef = useRef<HTMLButtonElement>(null)

  // Load app version
  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  const [workspaces, setWorkspaces] = useState<import('@shared/types').Workspace[]>([])

  // Load workspace data
  useEffect(() => {
    window.api.getWorkspaces().then((wsList) => {
      setWorkspaces(wsList)
    })
  }, [activeWorkspaceId])


  // Agents needing attention: awaiting or error (filtered by workspace)
  const attentionAgents = useMemo(() => {
    let candidates = agents.filter((a) => a.status === 'awaiting' || a.status === 'error')
    if (activeWorkspaceId) {
      candidates = candidates.filter((a) => a.workspaceId === activeWorkspaceId)
    }
    return candidates
  }, [agents, activeWorkspaceId])

  // Active (non-archived) agents filtered by workspace and search
  const filteredAgents = useMemo(() => {
    let active = agents.filter((a) => a.status !== 'archived')
    // Filter by workspace if one is selected
    if (activeWorkspaceId) {
      active = active.filter((a) => a.workspaceId === activeWorkspaceId)
    }
    if (!search) return active
    const q = search.toLowerCase().trim()
    // Support "status:xxx" filter syntax
    const statusMatch = q.match(/^status:(\w+)$/)
    if (statusMatch) {
      const statusFilter = statusMatch[1]
      return active.filter((a) => a.status.includes(statusFilter))
    }
    // Support "role:xxx" filter syntax
    const roleMatch = q.match(/^role:(.+)$/)
    if (roleMatch) {
      const roleFilter = roleMatch[1]
      return active.filter((a) => a.roleLabel?.toLowerCase().includes(roleFilter) ?? false)
    }
    return active.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.projectName.toLowerCase().includes(q) ||
        (a.roleLabel?.toLowerCase().includes(q) ?? false)
    )
  }, [agents, search, activeWorkspaceId])

  // 2-layer grouping: Machine → Project
  const machineGroups = useMemo(() => {
    // Determine machine for each agent
    const getMachine = (agent: Agent): { key: string; name: string; isSSH: boolean; host?: string } => {
      const ws = workspaces.find(w => w.id === agent.workspaceId)
      if (ws?.connectionType === 'ssh' && ws.sshConfig) {
        const host = ws.sshConfig.host || 'Remote'
        return { key: `ssh:${host}`, name: ws.name || host, isSSH: true, host }
      }
      return { key: 'local', name: 'Local', isSSH: false }
    }

    // Group: Machine → Project → Agents
    const machineMap = new Map<string, { name: string; isSSH: boolean; host?: string; projectMap: Map<string, Agent[]> }>()
    for (const agent of filteredAgents) {
      const machine = getMachine(agent)
      if (!machineMap.has(machine.key)) {
        machineMap.set(machine.key, { name: machine.name, isSSH: machine.isSSH, host: machine.host, projectMap: new Map() })
      }
      const m = machineMap.get(machine.key)!
      const projectAgents = m.projectMap.get(agent.projectName) ?? []
      projectAgents.push(agent)
      m.projectMap.set(agent.projectName, projectAgents)
    }

    // Build sorted structure
    const result: MachineGroup[] = []
    for (const [machineKey, m] of machineMap) {
      const projects: ProjectGroup[] = []
      for (const [projectName, projectAgents] of m.projectMap) {
        const sorted = [...projectAgents].sort((a, b) => {
          if (sortBy === 'name') return a.name.localeCompare(b.name)
          if (sortBy === 'status') return a.status.localeCompare(b.status)
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
        sorted.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
        projects.push({ projectName, agents: sorted })
      }
      projects.sort((a, b) => {
        const aIsGlobal = a.projectName.includes('Global') || a.projectName === '~'
        const bIsGlobal = b.projectName.includes('Global') || b.projectName === '~'
        if (aIsGlobal && !bIsGlobal) return -1
        if (!aIsGlobal && bIsGlobal) return 1
        return a.projectName.localeCompare(b.projectName)
      })
      result.push({ machineKey, machineName: m.name, isSSH: m.isSSH, sshHost: m.host, projects })
    }
    // Local first, then SSH
    return result.sort((a, b) => {
      if (!a.isSSH && b.isSSH) return -1
      if (a.isSSH && !b.isSSH) return 1
      return a.machineName.localeCompare(b.machineName)
    })
  }, [filteredAgents, sortBy, workspaces])

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

  // Strip ANSI escape sequences and terminal control codes from PTY output
  const stripAnsi = (str: string): string =>
    str
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // CSI sequences: ESC[...X
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07]*\x07/g, '')        // OSC sequences: ESC]...BEL
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[>=<][0-9]*[a-zA-Z]?/g, '')  // DEC private modes
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // remaining control chars
      .replace(/\s+/g, ' ')
      .trim()

  const getLastActivity = (agent: Agent): { preview: string; time: string | null } => {
    const agentMsgs = messages[agent.id] ?? []
    const lastMsg = agentMsgs[agentMsgs.length - 1]
    if (lastMsg) {
      const raw =
        lastMsg.role === 'manager' ? `You: ${lastMsg.content}` : lastMsg.content
      return { preview: stripAnsi(raw), time: lastMsg.createdAt }
    }
    return { preview: t(`agent.status.${agent.status}`), time: agent.updatedAt }
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, agentId: string) => {
    e.preventDefault()
    setContextMenu({ agentId, x: e.clientX, y: e.clientY })
  }, [])

  const handleArchiveAgent = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    setContextMenu(null)
    if (!confirm(t('agent.confirmArchive', 'Archive agent "{{name}}"?', { name: agent.name }))) return
    try {
      await window.api.archiveAgent(agentId)
      const remaining = agents.filter((a) => a.id !== agentId && a.status !== 'archived')
      if (selectedAgentId === agentId) {
        setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
      }
      // Reload is done by status change event
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents, selectedAgentId, setSelectedAgent])

  const [showArchived, setShowArchived] = useState(false)
  const archivedAgents = useMemo(() => agents.filter((a) => a.status === 'archived'), [agents])

  const handleUnarchiveAgent = useCallback(async (agentId: string) => {
    try {
      await window.api.unarchiveAgent(agentId)
      showToast(t('toast.agentRestored', 'Agent restored'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [])

  const handleRestartAgent = useCallback(async (agentId: string) => {
    setContextMenu(null)
    try {
      await window.api.restartAgent(agentId)
      showToast(t('toast.agentRestarted', 'Agent restarted'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [])

  const handleTogglePin = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    setContextMenu(null)
    await window.api.updateAgent(agentId, { isPinned: !agent.isPinned })
    useAppStore.getState().updateAgentInList(agentId, { isPinned: !agent.isPinned })
  }, [agents])

  const handleDuplicate = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    setContextMenu(null)
    try {
      const newAgent = await window.api.createAgent({
        name: `${agent.name} (copy)`,
        projectPath: agent.projectPath,
        projectName: agent.projectName,
        roleLabel: agent.roleLabel ?? undefined,
        systemPrompt: agent.systemPrompt ?? undefined,
        skills: agent.skills.length > 0 ? agent.skills : undefined,
        reportTo: agent.reportTo ?? undefined
      })
      useAppStore.getState().addAgent(newAgent)
      setSelectedAgent(newAgent.id)
      showToast(t('toast.agentCreated', 'Agent "{{name}}" created', { name: newAgent.name }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents, setSelectedAgent])

  const handleExportTemplate = useCallback(async (agentId: string) => {
    setContextMenu(null)
    try {
      const path = await window.api.exportAgentTemplate(agentId)
      if (path) showToast(t('toast.templateExported', 'Template exported to {{path}}', { path }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [])

  const handleCreateForProject = (projectName: string, workspaceId?: string): void => {
    setCreateForProject(projectName)
    setCreateForWorkspaceId(workspaceId ?? null)
    setShowCreate(true)
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-card overflow-hidden" role="navigation" aria-label={t('agent.sidebarLabel', 'Agent sidebar')}>
      {/* Workspace Switcher */}
      <div className="p-2 border-b border-border">
        <WorkspaceSwitcher />
      </div>

      {/* Header */}
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('agent.listTitle', 'Agents')}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSortBy((v) => v === 'updated' ? 'name' : v === 'name' ? 'status' : 'updated')}
              className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={`Sort: ${sortBy}`}
            >
              <ArrowUpDown size={14} />
            </button>
            <button
              onClick={() => {
                setCreateForProject(null)
                setShowCreate(true)
              }}
              className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={t('agent.new')}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-secondary rounded border-none outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" role="list" aria-label={t('agent.listLabel', 'Agent list')}>
        {/* ── Inbox Section ── */}
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

        {/* ── Workspaces Section ── */}
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
                      <span className="text-[10px] shrink-0">💻</span>
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
                  group.agents.map((agent) => {
                    const { preview, time } = getLastActivity(agent)
                    return (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent.id)}
                        onContextMenu={(e) => handleContextMenu(e, agent.id)}
                        className={cn(
                          'w-full flex items-center gap-2 pl-7 pr-2.5 py-1.5 text-left transition-colors hover:bg-accent/50',
                          selectedAgentId === agent.id && 'bg-accent'
                        )}
                      >
                        {/* Avatar + status dot */}
                        <div className="relative flex-shrink-0">
                          <AgentAvatar agent={agent} size="md" />
                          <div
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                              getStatusDot(agent.status)
                            )}
                          />
                        </div>

                        {/* Name + preview + time */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium truncate">
                              {agent.name}
                            </span>
                            {time && (
                              <span className="text-[9px] text-muted-foreground shrink-0 ml-1">
                                {formatTime(time)}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {preview}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (() => {
        const ctxAgent = agents.find((a) => a.id === contextMenu.agentId)
        if (!ctxAgent) return null
        return (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* Agent details header — editable fields */}
            <div className="px-3 py-2 border-b border-border/50 space-y-1.5">
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">{t('agent.project', 'Project')}:</span>
                <input
                  className="ml-1 bg-background border border-border/50 rounded px-1 py-0 text-[10px] font-mono w-full mt-0.5 outline-none focus:border-primary"
                  defaultValue={ctxAgent.projectName}
                  onBlur={async (e) => {
                    const val = e.target.value.trim()
                    if (val && val !== ctxAgent.projectName) {
                      await window.api.updateAgent(ctxAgent.id, { projectName: val })
                      useAppStore.getState().updateAgentInList(ctxAgent.id, { projectName: val })
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">{t('agent.projectPath', 'Path')}:</span>
                <input
                  className="ml-1 bg-background border border-border/50 rounded px-1 py-0 text-[10px] font-mono w-full mt-0.5 outline-none focus:border-primary"
                  defaultValue={ctxAgent.projectPath || ''}
                  placeholder="/home/user/project"
                  onBlur={async (e) => {
                    const val = e.target.value.trim()
                    if (val !== (ctxAgent.projectPath || '')) {
                      await window.api.updateAgent(ctxAgent.id, { projectPath: val || null })
                      useAppStore.getState().updateAgentInList(ctxAgent.id, { projectPath: val || undefined })
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">{t('agent.workspace', 'Workspace')}:</span>{' '}
                {(() => {
                  const ws = workspaces.find(w => w.id === ctxAgent.workspaceId)
                  return ws ? (
                    <span>{ws.name} {ws.connectionType === 'ssh' ? <span className="text-cyan-500 font-mono">[SSH]</span> : <span className="text-green-500 font-mono">[Local]</span>}</span>
                  ) : <span>—</span>
                })()}
              </div>
              {ctxAgent.roleLabel && (
                <div className="text-[10px] text-muted-foreground">
                  <span className="font-medium">{t('agent.role', 'Role')}:</span> {ctxAgent.roleLabel}
                </div>
              )}
            </div>

            <button
              onClick={() => handleTogglePin(ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              {ctxAgent.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              {ctxAgent.isPinned ? t('agent.actions.unpin') : t('agent.actions.pin')}
            </button>
            <button
              ref={emojiAnchorRef}
              onClick={() => setEmojiPickerTarget(emojiPickerTarget === ctxAgent.id ? null : ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <Smile size={12} />
              {t('agent.actions.changeIcon', 'Change Icon')}
            </button>
            <button
              onClick={() => handleRestartAgent(ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <RotateCw size={12} />
              {t('agent.actions.restart')}
            </button>
            <button
              onClick={() => handleDuplicate(ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <Copy size={12} />
              {t('agent.actions.duplicate', 'Duplicate')}
            </button>
            <button
              onClick={() => handleExportTemplate(ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            >
              <Download size={12} />
              {t('agent.actions.exportTemplate', 'Export Template')}
            </button>
            <div className="border-t border-border/50 my-1" />
            <button
              onClick={() => handleArchiveAgent(ctxAgent.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-red-400 transition-colors"
            >
              <Archive size={12} />
              {t('agent.actions.archive')}
            </button>
            {/* Emoji picker inline */}
            {emojiPickerTarget === ctxAgent.id && (
              <div className="relative">
                <EmojiPicker
                  value={ctxAgent.icon}
                  onChange={async (emoji) => {
                    try {
                      await window.api.updateAgent(ctxAgent.id, { icon: emoji })
                      useAppStore.getState().updateAgentInList(ctxAgent.id, { icon: emoji })
                    } catch (err) {
                      showToast(String(err), 'error')
                    }
                    setEmojiPickerTarget(null)
                    setContextMenu(null)
                  }}
                  onClose={() => setEmojiPickerTarget(null)}
                  anchorRef={emojiAnchorRef}
                />
              </div>
            )}
          </div>
        )
      })()}

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
