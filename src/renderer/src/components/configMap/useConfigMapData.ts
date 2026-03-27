import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppStore } from '@stores/useAppStore'
import type { ConfigMapData, ConfigNode, Workspace } from '@shared/types'

// ---------------------------------------------------------
// Layout: Grouped sector-based around center
// Categories are arranged in logical clusters:
//   Top: rules + settings (config core)
//   Right: mcpServers + hooks (integrations)
//   Bottom: skills + commands + templates (extensions)
//   Left: memory + agents (state/runtime)
// Within each sector, nodes are grouped by level (global -> project -> agent)
// ---------------------------------------------------------

interface SectorDef {
  angle: number
  baseRadius: number
  group: string
}

// Logical grouping -- top-down hierarchy layout:
//   Top:    Core (Rules, Settings) -- the "brain"
//   Left:   Integrations (MCP, Hooks) -- external connections
//   Right:  Runtime (Memory, Agents) -- state & actors
//   Bottom: Extensions (Skills, Commands, Templates) -- capabilities
export const CATEGORY_SECTORS: Record<string, SectorDef> = {
  // Group: Core (top center)
  rules:      { angle: -100, baseRadius: 180, group: 'core' },
  settings:   { angle: -80,  baseRadius: 180, group: 'core' },
  // Group: Integrations (left)
  mcpServers: { angle: -160, baseRadius: 200, group: 'integrations' },
  hooks:      { angle: 160,  baseRadius: 200, group: 'integrations' },
  // Group: Runtime (right)
  memory:     { angle: -20,  baseRadius: 200, group: 'runtime' },
  agents:     { angle: 20,   baseRadius: 200, group: 'runtime' },
  // Group: Extensions (bottom)
  skills:     { angle: 70,   baseRadius: 210, group: 'extensions' },
  commands:   { angle: 90,   baseRadius: 210, group: 'extensions' },
  templates:  { angle: 110,  baseRadius: 210, group: 'extensions' }
}

const LEVEL_ORDER: Record<string, number> = { global: 0, project: 1, agent: 2 }

export function getGroupedNodePositions(
  nodes: ConfigNode[],
  cx: number,
  cy: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  // Group nodes by category, then sort by level within each category
  const byCategory = new Map<string, ConfigNode[]>()
  for (const node of nodes) {
    const existing = byCategory.get(node.category) || []
    existing.push(node)
    byCategory.set(node.category, existing)
  }

  for (const [category, catNodes] of byCategory) {
    const sector = CATEGORY_SECTORS[category]
    if (!sector) continue

    // Sort by level: global -> project -> agent (keeps related items together)
    const sorted = [...catNodes].sort((a, b) =>
      (LEVEL_ORDER[a.level] ?? 0) - (LEVEL_ORDER[b.level] ?? 0)
    )

    const count = sorted.length
    const baseAngle = (sector.angle * Math.PI) / 180

    if (count === 1) {
      positions.set(sorted[0].id, {
        x: cx + sector.baseRadius * Math.cos(baseAngle),
        y: cy + sector.baseRadius * Math.sin(baseAngle)
      })
    } else {
      // Spread nodes in an arc within their sector
      // More nodes -> wider spread, with radial staggering by level
      const arcSpread = Math.min(0.18 * count, 0.8) // radians, capped
      const radialStep = 50 // px between level rings

      for (let i = 0; i < count; i++) {
        const node = sorted[i]
        const levelIdx = LEVEL_ORDER[node.level] ?? 0
        const radius = sector.baseRadius + levelIdx * radialStep

        // Distribute within the arc
        const t = count > 1 ? (i / (count - 1)) - 0.5 : 0
        const angle = baseAngle + t * arcSpread

        positions.set(node.id, {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle)
        })
      }
    }
  }

  return positions
}

export const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; width: number }> = {
  inherits:   { stroke: 'cyan',   dasharray: '',      width: 2 },
  overrides:  { stroke: 'red',    dasharray: '6 3',   width: 2 },
  references: { stroke: 'accent', dasharray: '3 4',   width: 1.5 },
  configures: { stroke: 'gray',   dasharray: '4 3',   width: 1.5 }
}

// Group background arcs
export const GROUP_DEFS: { group: string; label: string; color: string; startAngle: number; endAngle: number }[] = [
  { group: 'core',         label: 'Core',         color: 'cyan',   startAngle: -115, endAngle: -65 },
  { group: 'integrations', label: 'Integrations', color: 'green',  startAngle: -180, endAngle: -130 },
  { group: 'runtime',      label: 'Runtime',      color: 'purple', startAngle: -40,  endAngle: 40 },
  { group: 'extensions',   label: 'Extensions',   color: 'orange', startAngle: 55,   endAngle: 125 }
]

export function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const startRad = (startDeg * Math.PI) / 180
  const endRad = (endDeg * Math.PI) / 180
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

export const SVG_WIDTH = 1000
export const SVG_HEIGHT = 700

export interface UseConfigMapDataResult {
  // View state
  viewMode: 'overview' | 'detail'
  setViewMode: (mode: 'overview' | 'detail') => void
  isFullscreen: boolean
  handleToggleFullscreen: () => Promise<void>

  // Path selection
  availablePaths: Map<string, string>
  resolvedPath: string | null
  setSelectedPath: (path: string | null) => void
  handleDrillDown: (path: string) => void

  // Data
  data: ConfigMapData | null
  loading: boolean

  // Node interaction
  selectedNode: ConfigNode | null
  setSelectedNode: (node: ConfigNode | null) => void
  hoveredNode: ConfigNode | null
  tooltipPos: { x: number; y: number }
  handleNodeClick: (node: ConfigNode) => void
  handleNodeHoverChange: (node: ConfigNode | null) => void
  handleContainerMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void

  // Map dimensions & resize
  mapHeight: number
  setMapHeight: (h: number) => void

  // Pan/zoom
  pan: { x: number; y: number }
  setPan: (p: { x: number; y: number }) => void
  scale: number
  setScale: (s: number | ((prev: number) => number)) => void
  svgRef: React.RefObject<SVGSVGElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  handlePointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  handlePointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  handlePointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleZoomFit: () => void

  // Computed
  nodePositions: Map<string, { x: number; y: number }>
  conflictedNodeIds: Set<string>
  activeGroups: Set<string>

  // Constants
  cx: number
  cy: number
}

export function useConfigMapData(workspaces: Workspace[]): UseConfigMapDataResult {
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleToggleFullscreen = useCallback(async () => {
    const result = await window.api.toggleFullscreen()
    setIsFullscreen(result)
  }, [])

  const { activeWorkspaceId, agents, selectedAgentId } = useAppStore()

  // Build list of all available paths (workspaces + unique agent project paths)
  const availablePaths = useMemo(() => {
    const paths = new Map<string, string>()
    const isHomePath = (p: string): boolean => {
      const normalized = p.replace(/[\\/]+$/, '')
      return normalized === '~' || normalized === '~/' ||
        /^[A-Z]:[\\/]Users[\\/][^\\/]+$/.test(normalized) ||
        /^\/home\/[^/]+$/.test(normalized) ||
        /^\/Users\/[^/]+$/.test(normalized)
    }
    const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const seen = new Set<string>()
    for (const ws of workspaces) {
      if (isHomePath(ws.path)) continue
      const key = normalize(ws.path)
      if (seen.has(key)) continue
      seen.add(key)
      const name = ws.path.split('/').pop() || ws.path.split('\\').pop() || ws.path
      paths.set(ws.path, name)
    }
    for (const agent of agents) {
      if (!agent.projectPath || isHomePath(agent.projectPath)) continue
      const key = normalize(agent.projectPath)
      if (seen.has(key)) continue
      seen.add(key)
      const name = agent.projectPath.split('/').pop() || agent.projectPath.split('\\').pop() || agent.projectPath
      paths.set(agent.projectPath, name)
    }
    return paths
  }, [workspaces, agents])

  // Default: active workspace > selected agent > first agent
  const defaultPath = useMemo(() => {
    const activeWs = workspaces.find(w => w.id === activeWorkspaceId)
    if (activeWs) return activeWs.path
    const selected = agents.find(a => a.id === selectedAgentId)
    if (selected?.projectPath) return selected.projectPath
    const firstActive = agents.find(a => a.status !== 'archived' && a.projectPath)
    return firstActive?.projectPath || null
  }, [workspaces, activeWorkspaceId, agents, selectedAgentId])

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const resolvedPath = selectedPath ?? defaultPath

  // Sync when default changes (e.g. workspace switch)
  useEffect(() => {
    setSelectedPath(null)
  }, [defaultPath])

  const [data, setData] = useState<ConfigMapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState<ConfigNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<ConfigNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Map height (resizable)
  const [mapHeight, setMapHeight] = useState(500)

  // Pan/zoom
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cx = SVG_WIDTH / 2
  const cy = SVG_HEIGHT / 2

  // Load data when resolved path changes
  useEffect(() => {
    if (!resolvedPath) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    window.api.getConfigMapData(resolvedPath).then((result) => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
        setSelectedNode(null)
        setPan({ x: 0, y: 0 })
        setScale(1)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [resolvedPath])

  // Wheel zoom (Ctrl/Cmd + wheel only)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        const ds = -e.deltaY * 0.002
        setScale(s => Math.min(Math.max(0.3, s + ds), 4))
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [data, loading])

  // Escape to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.api.toggleFullscreen().then((result) => setIsFullscreen(result))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target instanceof SVGElement && e.target.tagName === 'svg') {
      isDragging.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      lastMouse.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    isDragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  // Tooltip: track mouse position relative to container
  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (hoveredNode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 })
    }
  }, [hoveredNode])

  const handleNodeHoverChange = useCallback((node: ConfigNode | null) => {
    setHoveredNode(node)
  }, [])

  // Compute positions with grouping
  const nodePositions = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number }>()
    return getGroupedNodePositions(data.nodes, cx, cy)
  }, [data, cx, cy])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setScale(s => Math.min(4, s + 0.2))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale(s => Math.max(0.3, s - 0.2))
  }, [])

  const handleZoomFit = useCallback(() => {
    if (!data || !containerRef.current) return
    const allPos = Array.from(nodePositions.values())
    if (allPos.length === 0) return
    const margin = 80
    const minX = Math.min(...allPos.map(p => p.x)) - margin
    const maxX = Math.max(...allPos.map(p => p.x)) + margin
    const minY = Math.min(...allPos.map(p => p.y)) - margin
    const maxY = Math.max(...allPos.map(p => p.y)) + margin
    const contentW = maxX - minX
    const contentH = maxY - minY

    const containerW = containerRef.current.clientWidth
    const containerH = containerRef.current.clientHeight

    const fitScale = Math.min(containerW / contentW, containerH / contentH, 1.5)

    const contentCx = (minX + maxX) / 2
    const contentCy = (minY + maxY) / 2
    const targetPanX = (containerW / 2) - contentCx * fitScale
    const targetPanY = (containerH / 2) - contentCy * fitScale

    setScale(fitScale)
    setPan({ x: targetPanX, y: targetPanY })
  }, [data, nodePositions])

  // Conflict lookup
  const conflictedNodeIds = useMemo(() => {
    if (!data) return new Set<string>()
    const ids = new Set<string>()
    for (const c of data.conflicts) {
      for (const id of c.nodeIds) ids.add(id)
    }
    return ids
  }, [data])

  const handleNodeClick = useCallback((node: ConfigNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  // Which groups have nodes?
  const activeGroups = useMemo(() => {
    if (!data) return new Set<string>()
    const groups = new Set<string>()
    for (const node of data.nodes) {
      const sector = CATEGORY_SECTORS[node.category]
      if (sector) groups.add(sector.group)
    }
    return groups
  }, [data])

  // Drill down from overview to detail
  const handleDrillDown = useCallback((path: string) => {
    setSelectedPath(path)
    setViewMode('detail')
  }, [])

  return {
    viewMode,
    setViewMode,
    isFullscreen,
    handleToggleFullscreen,
    availablePaths,
    resolvedPath,
    setSelectedPath,
    handleDrillDown,
    data,
    loading,
    selectedNode,
    setSelectedNode,
    hoveredNode,
    tooltipPos,
    handleNodeClick,
    handleNodeHoverChange,
    handleContainerMouseMove,
    mapHeight,
    setMapHeight,
    pan,
    setPan,
    scale,
    setScale,
    svgRef,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleZoomIn,
    handleZoomOut,
    handleZoomFit,
    nodePositions,
    conflictedNodeIds,
    activeGroups,
    cx,
    cy
  }
}
