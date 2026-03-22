import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '@stores/useAppStore'
import type { Agent } from '@shared/types'
import type { Workspace } from '@shared/types'

export interface ProjectGroup {
  projectName: string
  agents: Agent[]
}

export interface MachineGroup {
  machineKey: string
  machineName: string
  isSSH: boolean
  sshHost?: string
  projects: ProjectGroup[]
}

export function formatTime(dateStr: string): string {
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

/** Strip ANSI escape sequences and terminal control codes from PTY output */
export function stripAnsi(str: string): string {
  return str
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
}

export type SortBy = 'name' | 'status' | 'updated'

export function useAgentListGroups(
  search: string,
  sortBy: SortBy
): {
  machineGroups: MachineGroup[]
  filteredAgents: Agent[]
  attentionAgents: Agent[]
  archivedAgents: Agent[]
  workspaces: Workspace[]
} {
  const { agents, activeWorkspaceId } = useAppStore()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

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

  // Archived agents
  const archivedAgents = useMemo(() => agents.filter((a) => a.status === 'archived'), [agents])

  // 2-layer grouping: Machine -> Project
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

    // Group: Machine -> Project -> Agents
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

  return { machineGroups, filteredAgents, attentionAgents, archivedAgents, workspaces }
}
