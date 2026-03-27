import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@stores/useAppStore'
import type { Agent, Workspace, AgentProfileData, ClaudeTaskSession } from '@shared/types'
import {
  type CyberPalette,
  type CyberStyle,
  type MachineGroup2,
  useCyberPalette,
  getStatusTheme,
  groupByMachineAndProject,
  getRadialPosition,
  SVG_WIDTH,
  SVG_HEIGHT
} from './types'
import type { AgentStatus, Team } from '@shared/types'

export function useActivityMapState(teams: Team[]) {
  const { agents, usePtyMode, updateAgentInList, agentMemory, activeChainFlows, agentTeamsData } = useAppStore()
  const palette = useCyberPalette()
  const statusTheme = useMemo(() => getStatusTheme(palette), [palette])

  // Active agents
  const activeAgents = useMemo(() => agents.filter((a) => a.status !== 'archived'), [agents])

  // Workspace name resolution
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  useEffect(() => {
    window.api.getWorkspaces().then(setWorkspaces).catch(() => {})
  }, [])
  const workspaceNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ws of workspaces) map.set(ws.id, ws.name)
    return map
  }, [workspaces])
  const resolveWorkspaceName = useCallback((agent: Agent): string => {
    if (!agent.workspaceId) return 'Default'
    return workspaceNameMap.get(agent.workspaceId) ?? agent.workspaceId.split('/').pop()?.split('\\').pop() ?? 'Default'
  }, [workspaceNameMap])

  // Pan, Zoom and Field Size States
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mapHeight, setMapHeight] = useState(500)
  const svgRef = useRef<SVGSVGElement>(null)

  // Cockpit view state
  const [cockpitAgentId, setCockpitAgentId] = useState<string | null>(null)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)

  // Agent capability data for cockpit
  const [cockpitProfile, setCockpitProfile] = useState<AgentProfileData | null>(null)
  useEffect(() => {
    if (!cockpitAgentId) { setCockpitProfile(null); return }
    window.api.getAgentProfile(cockpitAgentId).then(setCockpitProfile).catch(() => setCockpitProfile(null))
  }, [cockpitAgentId])

  // Agent rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = useCallback((name: string) => {
    setRenameValue(name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }, [])

  const commitRename = useCallback(async (agentId: string) => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== agents.find(a => a.id === agentId)?.name) {
      await window.api.updateAgent(agentId, { name: trimmed })
      updateAgentInList(agentId, { name: trimmed })
    }
    setIsRenaming(false)
  }, [renameValue, agents, updateAgentInList])

  const handleAgentNodeClick = useCallback((id: string) => {
    setCockpitAgentId(id)
  }, [])

  const centerX = SVG_WIDTH / 2
  const centerY = SVG_HEIGHT / 2

  // Wheel event for Zoom
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const ds = -e.deltaY * 0.002
        setScale(s => Math.min(Math.max(0.4, s + ds), 4))
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Zoom controls
  const handleZoomIn = useCallback(() => setScale(s => Math.min(4, s + 0.2)), [])
  const handleZoomOut = useCallback(() => setScale(s => Math.max(0.4, s - 0.2)), [])
  const handleZoomFit = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [])

  // 2-layer grouping: Machine -> Project -> Agents
  const machineGroups = useMemo(
    () => groupByMachineAndProject(activeAgents, workspaces, workspaceNameMap),
    [activeAgents, workspaces, workspaceNameMap]
  )

  const { positions, teamSectors, machineLabels, projectLabels } = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    const sectors: { team: Team | null; startAngle: number; endAngle: number }[] = []
    const mLabels: { name: string; isSSH: boolean; x: number; y: number }[] = []
    const pLabels: { name: string; x: number; y: number }[] = []
    if (activeAgents.length === 0) return { positions: pos, teamSectors: sectors, machineLabels: mLabels, projectLabels: pLabels }

    const totalAgents = activeAgents.length
    const mainRadius = 200
    const NODE_SPACING = 80

    let globalIndex = 0

    for (const machine of machineGroups) {
      const machineAgentCount = machine.projects.reduce((sum, p) => sum + p.agents.length, 0)
      const machineMidIndex = globalIndex + (machineAgentCount - 1) / 2
      const machineMidAngle = (2 * Math.PI * machineMidIndex) / totalAgents - Math.PI / 2
      const machineLabelRadius = mainRadius + 90
      mLabels.push({
        name: machine.machineName,
        isSSH: machine.isSSH,
        x: centerX + machineLabelRadius * Math.cos(machineMidAngle),
        y: centerY + machineLabelRadius * Math.sin(machineMidAngle)
      })

      for (const project of machine.projects) {
        const agentCount = project.agents.length
        const projectStartIndex = globalIndex

        if (agentCount === 1) {
          const position = getRadialPosition(globalIndex, totalAgents, centerX, centerY, mainRadius)
          pos.set(project.agents[0].id, position)
        } else {
          const midIndex = globalIndex + (agentCount - 1) / 2
          const anchorAngle = (2 * Math.PI * midIndex) / totalAgents - Math.PI / 2
          const anchorX = centerX + mainRadius * Math.cos(anchorAngle)
          const anchorY = centerY + mainRadius * Math.sin(anchorAngle)

          const tangentX = -Math.sin(anchorAngle)
          const tangentY = Math.cos(anchorAngle)

          for (let i = 0; i < agentCount; i++) {
            const offset = (i - (agentCount - 1) / 2) * NODE_SPACING
            pos.set(project.agents[i].id, {
              x: anchorX + tangentX * offset,
              y: anchorY + tangentY * offset
            })
          }
        }

        const projMidIndex = globalIndex + (agentCount - 1) / 2
        const projMidAngle = (2 * Math.PI * projMidIndex) / totalAgents - Math.PI / 2
        const projLabelRadius = mainRadius + 55
        pLabels.push({
          name: project.projectName,
          x: centerX + projLabelRadius * Math.cos(projMidAngle),
          y: centerY + projLabelRadius * Math.sin(projMidAngle)
        })

        const startAngle = (2 * Math.PI * projectStartIndex) / totalAgents - Math.PI / 2
        const endAngle = (2 * Math.PI * (projectStartIndex + agentCount)) / totalAgents - Math.PI / 2
        const teamForGroup = teams.find(t => project.agents.some(a => a.teamId === t.id))
        sectors.push({ team: teamForGroup ?? null, startAngle, endAngle })

        globalIndex += agentCount
      }
    }
    return { positions: pos, teamSectors: sectors, machineLabels: mLabels, projectLabels: pLabels }
  }, [activeAgents, teams, centerX, centerY, machineGroups])

  // External CLI sessions
  const { activeExternalSessions, staleSessionCount } = useMemo(() => {
    if (!agentTeamsData?.taskSessions.length) return { activeExternalSessions: [] as ClaudeTaskSession[], staleSessionCount: 0 }
    const knownSessionIds = new Set(
      agents.filter(a => a.claudeSessionId).map(a => a.claudeSessionId!)
    )
    const unmatched = agentTeamsData.taskSessions.filter(s => !knownSessionIds.has(s.sessionId))
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const active = unmatched.filter(s => new Date(s.lastModified).getTime() > fiveMinAgo)
    const stale = unmatched.length - active.length
    return { activeExternalSessions: active, staleSessionCount: stale }
  }, [agentTeamsData, agents])

  const stats = useMemo(() => {
    const total = activeAgents.length
    const active = activeAgents.filter((a) => ['active', 'thinking', 'tool_running', 'awaiting'].includes(a.status)).length
    const error = activeAgents.filter((a) => a.status === 'error').length
    return { total, active, error, staleCli: staleSessionCount }
  }, [activeAgents, staleSessionCount])

  // Positions for active external sessions on outer ring
  const externalPositions = useMemo(() => {
    if (activeExternalSessions.length === 0) return new Map<string, { x: number; y: number }>()
    const outerRadius = 320
    const pos = new Map<string, { x: number; y: number }>()
    for (let i = 0; i < activeExternalSessions.length; i++) {
      const angle = (2 * Math.PI * i) / activeExternalSessions.length - Math.PI / 2
      pos.set(activeExternalSessions[i].sessionId, {
        x: centerX + outerRadius * Math.cos(angle),
        y: centerY + outerRadius * Math.sin(angle)
      })
    }
    return pos
  }, [activeExternalSessions, centerX, centerY])

  // Track highwatermark changes for matched agents (pulse indicator)
  const prevHwmRef = useRef(new Map<string, number>())
  const [pulsingAgents, setPulsingAgents] = useState(new Set<string>())
  useEffect(() => {
    if (!agentTeamsData?.taskSessions.length) return
    const newPulsing = new Set<string>()
    for (const session of agentTeamsData.taskSessions) {
      const matchedAgent = agents.find(a => a.claudeSessionId === session.sessionId)
      if (!matchedAgent) continue
      const prevHwm = prevHwmRef.current.get(session.sessionId)
      if (prevHwm !== undefined && prevHwm !== session.highwatermark) {
        newPulsing.add(matchedAgent.id)
      }
      prevHwmRef.current.set(session.sessionId, session.highwatermark)
    }
    if (newPulsing.size > 0) {
      setPulsingAgents(newPulsing)
      const timer = setTimeout(() => setPulsingAgents(new Set()), 3000)
      return () => clearTimeout(timer)
    }
  }, [agentTeamsData, agents])

  // Pan drag refs
  const isDraggingMap = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target instanceof SVGElement && e.target.tagName === 'svg') {
      isDraggingMap.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isDraggingMap.current) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      lastMousePos.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingMap.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return {
    // Theme
    palette,
    statusTheme,
    // Agents
    agents,
    activeAgents,
    usePtyMode,
    agentMemory,
    activeChainFlows,
    // Workspace
    resolveWorkspaceName,
    // Pan/Zoom
    scale,
    pan,
    setPan,
    mapHeight,
    setMapHeight,
    svgRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    // Layout
    centerX,
    centerY,
    positions,
    teamSectors,
    machineLabels,
    projectLabels,
    externalPositions,
    // Stats
    stats,
    activeExternalSessions,
    pulsingAgents,
    // Cockpit
    cockpitAgentId,
    setCockpitAgentId,
    terminalCollapsed,
    setTerminalCollapsed,
    cockpitProfile,
    // Rename
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    renameInputRef,
    startRename,
    commitRename,
    handleAgentNodeClick,
    updateAgentInList
  }
}
