import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { CreateAgentDialog } from './CreateAgentDialog'
import {
  Plus,
  Search,
  Inbox,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ExternalLink
} from 'lucide-react'
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

export function AgentList(): JSX.Element {
  const { t } = useTranslation()
  const { agents, selectedAgentId, setSelectedAgent, messages, activeWorkspaceId } = useAppStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForProject, setCreateForProject] = useState<string | null>(null)
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

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
    const q = search.toLowerCase()
    return active.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.projectName.toLowerCase().includes(q) ||
        (a.roleLabel?.toLowerCase().includes(q) ?? false)
    )
  }, [agents, search, activeWorkspaceId])

  // Group by project
  const projectGroups = useMemo(() => {
    const map = new Map<string, Agent[]>()
    for (const agent of filteredAgents) {
      const group = map.get(agent.projectName) ?? []
      group.push(agent)
      map.set(agent.projectName, group)
    }
    const groups: ProjectGroup[] = []
    for (const [projectName, groupAgents] of map) {
      groups.push({ projectName, agents: groupAgents })
    }
    return groups.sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [filteredAgents])

  const toggleProject = (name: string): void => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const getLastActivity = (agent: Agent): { preview: string; time: string | null } => {
    const agentMsgs = messages[agent.id] ?? []
    const lastMsg = agentMsgs[agentMsgs.length - 1]
    if (lastMsg) {
      const preview =
        lastMsg.role === 'manager' ? `You: ${lastMsg.content}` : lastMsg.content
      return { preview, time: lastMsg.createdAt }
    }
    return { preview: t(`agent.status.${agent.status}`), time: agent.updatedAt }
  }

  const handleCreateForProject = (projectName: string): void => {
    setCreateForProject(projectName)
    setShowCreate(true)
  }

  return (
    <div className="flex flex-col w-64 min-w-[220px] max-w-[320px] border-r border-border bg-card resize-x overflow-hidden">
      {/* Workspace Switcher */}
      <div className="p-2 border-b border-border">
        <WorkspaceSwitcher />
      </div>

      {/* Header */}
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Agents
          </span>
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

      <div className="flex-1 overflow-y-auto">
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
                    <div
                      key={agent.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 mx-1 rounded-md',
                        isError
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-yellow-500/10 border border-yellow-500/20'
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
                      <button
                        onClick={() => setSelectedAgent(agent.id)}
                        className={cn(
                          'shrink-0 p-1 rounded transition-colors',
                          isError
                            ? 'hover:bg-red-500/20 text-red-500'
                            : 'hover:bg-yellow-500/20 text-orange-500'
                        )}
                        title="Open"
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
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

        {projectGroups.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {agents.filter((a) => a.status !== 'archived').length === 0
              ? t('agent.noAgents')
              : `"${search}" — no results`}
          </div>
        ) : (
          projectGroups.map((group) => {
            const isCollapsed = collapsedProjects.has(group.projectName)
            return (
              <div key={group.projectName} className="mb-0.5">
                {/* Project header */}
                <div className="flex items-center gap-1 px-1.5 py-1 group">
                  <button
                    onClick={() => toggleProject(group.projectName)}
                    className="flex items-center gap-1 flex-1 min-w-0 rounded px-1 py-0.5 hover:bg-accent/50 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                    )}
                    <FolderOpen size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-semibold text-foreground truncate">
                      {group.projectName}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">
                      {group.agents.length}
                    </span>
                  </button>
                  <button
                    onClick={() => handleCreateForProject(group.projectName)}
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
                        className={cn(
                          'w-full flex items-center gap-2 pl-7 pr-2.5 py-1.5 text-left transition-colors hover:bg-accent/50',
                          selectedAgentId === agent.id && 'bg-accent'
                        )}
                      >
                        {/* Avatar + status dot */}
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium">
                            {getInitials(agent.name)}
                          </div>
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
          })
        )}
      </div>

      {showCreate && (
        <CreateAgentDialog
          onClose={() => {
            setShowCreate(false)
            setCreateForProject(null)
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
        />
      )}
    </div>
  )
}
