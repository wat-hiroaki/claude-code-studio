import { useMemo } from 'react'
import type { AgentStatus, Team, Agent, Workspace, ClaudeTaskSession } from '@shared/types'
import { cyberPaletteDark as sharedDark, cyberPaletteLight as sharedLight, useResolvedTheme } from '@lib/cyber-theme'

// ---------------------------------------------------------
// CYBER/HUD THEME DEFINITIONS
// ---------------------------------------------------------
export const cyberPaletteDark = {
  ...sharedDark,
  grid: '#18181b',
  cockpitBg: '#09090b',
  cockpitHeaderBg: 'rgba(24, 24, 27, 0.5)',
  cockpitBorder: '#3f3f46'
}

export const cyberPaletteLight = {
  ...sharedLight,
  grid: '#e2e8f0',
  cockpitBg: '#ffffff',
  cockpitHeaderBg: 'rgba(241, 245, 249, 0.8)',
  cockpitBorder: '#cbd5e1'
}

export type CyberPalette = typeof cyberPaletteDark

export function useCyberPalette(): CyberPalette {
  const resolved = useResolvedTheme()
  return resolved === 'dark' ? cyberPaletteDark : cyberPaletteLight
}

export type CyberStyle = { color: string; glow: string; label: string }

export function getStatusTheme(palette: CyberPalette): Record<AgentStatus, CyberStyle> {
  return {
    creating: { color: palette.gray, glow: 'rgba(82,82,91,0.4)', label: 'INIT' },
    active: { color: palette.green, glow: 'rgba(16,185,129,0.4)', label: 'ACTIVE' },
    thinking: { color: palette.cyan, glow: 'rgba(14,165,233,0.4)', label: 'COMPUTING' },
    tool_running: { color: palette.orange, glow: 'rgba(245,158,11,0.4)', label: 'EXEC' },
    awaiting: { color: palette.accent, glow: 'rgba(113,113,122,0.4)', label: 'AWAIT' },
    error: { color: palette.red, glow: 'rgba(239,68,68,0.5)', label: 'ERR: CRITICAL' },
    session_conflict: { color: palette.purple, glow: 'rgba(139,92,246,0.4)', label: 'CONFLICT' },
    idle: { color: palette.gray, glow: 'transparent', label: 'STANDBY' },
    archived: { color: palette.darkGray, glow: 'transparent', label: 'OFFLINE' }
  }
}

// ---------------------------------------------------------
// Props interfaces
// ---------------------------------------------------------
export interface ActivityMapProps {
  teams: Team[]
  onAgentClick: (id: string) => void
}

// ---------------------------------------------------------
// 2-LAYER GROUPING: Machine -> Project -> Agents
// ---------------------------------------------------------
export interface ProjectGroup2 {
  projectName: string
  agents: Agent[]
}

export interface MachineGroup2 {
  machineKey: string
  machineName: string
  isSSH: boolean
  sshHost?: string
  projects: ProjectGroup2[]
}

export function groupByMachineAndProject(agents: Agent[], workspaces: Workspace[], workspaceNameMap: Map<string, string>): MachineGroup2[] {
  const getMachine = (agent: Agent): { key: string; name: string; isSSH: boolean; host?: string } => {
    const ws = workspaces.find(w => w.id === agent.workspaceId)
    if (ws?.connectionType === 'ssh' && ws.sshConfig) {
      const host = ws.sshConfig.host || 'Remote'
      return { key: `ssh:${host}`, name: ws.name || host, isSSH: true, host }
    }
    return { key: 'local', name: 'Local', isSSH: false }
  }

  const machineMap = new Map<string, { name: string; isSSH: boolean; host?: string; projectMap: Map<string, Agent[]> }>()
  for (const agent of agents) {
    const machine = getMachine(agent)
    if (!machineMap.has(machine.key)) {
      machineMap.set(machine.key, { name: machine.name, isSSH: machine.isSSH, host: machine.host, projectMap: new Map() })
    }
    const m = machineMap.get(machine.key)!
    const projectName = workspaceNameMap.get(agent.workspaceId || '') || agent.projectName || 'Default'
    const projectAgents = m.projectMap.get(projectName) ?? []
    projectAgents.push(agent)
    m.projectMap.set(projectName, projectAgents)
  }

  const result: MachineGroup2[] = []
  for (const [machineKey, m] of machineMap) {
    const projects: ProjectGroup2[] = []
    for (const [projectName, projectAgents] of m.projectMap) {
      projects.push({ projectName, agents: projectAgents })
    }
    projects.sort((a, b) => a.projectName.localeCompare(b.projectName))
    result.push({ machineKey, machineName: m.name, isSSH: m.isSSH, sshHost: m.host, projects })
  }
  // Local first, then SSH
  return result.sort((a, b) => {
    if (!a.isSSH && b.isSSH) return -1
    if (a.isSSH && !b.isSSH) return 1
    return a.machineName.localeCompare(b.machineName)
  })
}

// Helper: Calculate positions around a center
export function getRadialPosition(index: number, total: number, centerX: number, centerY: number, radius: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  }
}

// Canvas constants
export const SVG_WIDTH = 800
export const SVG_HEIGHT = 600
