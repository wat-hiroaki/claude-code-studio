import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Minus, Maximize, Maximize2, X, GripHorizontal, Globe, FolderOpen } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { cyberPaletteDark, cyberPaletteLight, useResolvedTheme } from '../lib/cyber-theme'
import { ConfigMapNode } from './ConfigMapNode'
import { ConfigMapDetailPanel } from './ConfigMapDetailPanel'
import { ConfigMapOverview } from './ConfigMapOverview'
import type { ConfigMapData, ConfigNode, Workspace } from '@shared/types'

// ---------------------------------------------------------
// Layout: Grouped sector-based around center
// Categories are arranged in logical clusters:
//   Top: rules + settings (config core)
//   Right: mcpServers + hooks (integrations)
//   Bottom: skills + commands + templates (extensions)
//   Left: memory + agents (state/runtime)
// Within each sector, nodes are grouped by level (global → project → agent)
// ---------------------------------------------------------

interface SectorDef {
  angle: number
  baseRadius: number
  group: string
}

// Logical grouping — top-down hierarchy layout:
//   Top:    Core (Rules, Settings) — the "brain"
//   Left:   Integrations (MCP, Hooks) — external connections
//   Right:  Runtime (Memory, Agents) — state & actors
//   Bottom: Extensions (Skills, Commands, Templates) — capabilities
const CATEGORY_SECTORS: Record<string, SectorDef> = {
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

function getGroupedNodePositions(
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

    // Sort by level: global → project → agent (keeps related items together)
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
      // More nodes → wider spread, with radial staggering by level
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

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string; width: number }> = {
  inherits:   { stroke: 'cyan',   dasharray: '',      width: 2 },
  overrides:  { stroke: 'red',    dasharray: '6 3',   width: 2 },
  references: { stroke: 'accent', dasharray: '3 4',   width: 1.5 },
  configures: { stroke: 'gray',   dasharray: '4 3',   width: 1.5 }
}

// Group background arcs
const GROUP_DEFS: { group: string; label: string; color: string; startAngle: number; endAngle: number }[] = [
  { group: 'core',         label: 'Core',         color: 'cyan',   startAngle: -115, endAngle: -65 },
  { group: 'integrations', label: 'Integrations', color: 'green',  startAngle: -180, endAngle: -130 },
  { group: 'runtime',      label: 'Runtime',      color: 'purple', startAngle: -40,  endAngle: 40 },
  { group: 'extensions',   label: 'Extensions',   color: 'orange', startAngle: 55,   endAngle: 125 }
]

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const startRad = (startDeg * Math.PI) / 180
  const endRad = (endDeg * Math.PI) / 180
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

interface ConfigMapProps {
  workspaces: Workspace[]
}

export function ConfigMap({ workspaces }: ConfigMapProps): JSX.Element {
  const { t } = useTranslation()
  const resolved = useResolvedTheme()
  const palette = resolved === 'dark' ? cyberPaletteDark : cyberPaletteLight

  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Sync fullscreen state with Electron window
  const handleToggleElectronFullscreen = useCallback(async () => {
    const result = await window.api.toggleFullscreen()
    setIsFullscreen(result)
  }, [])

  const { activeWorkspaceId, agents, selectedAgentId } = useAppStore()

  // Build list of all available paths (workspaces + unique agent project paths)
  // Filter out home directory and root-like paths that aren't real projects
  const availablePaths = useMemo(() => {
    const paths = new Map<string, string>() // path → display name
    const isHomePath = (p: string): boolean => {
      const normalized = p.replace(/[\\/]+$/, '')
      return normalized === '~' || normalized === '~/' ||
        /^[A-Z]:[\\/]Users[\\/][^\\/]+$/.test(normalized) ||
        /^\/home\/[^/]+$/.test(normalized) ||
        /^\/Users\/[^/]+$/.test(normalized)
    }
    const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const seen = new Set<string>() // normalized keys
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

  const svgWidth = 1000
  const svgHeight = 700
  const cx = svgWidth / 2
  const cy = svgHeight / 2

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

  // Wheel zoom (Ctrl/Cmd + wheel only, matching ActivityMap)
  // Attach to the container div to catch events before they reach the browser zoom handler
  // Re-attach when data/loading changes since containerRef may not exist during loading state
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

  // Compute positions with grouping (must be before handleZoomFit)
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

  const handleToggleFullscreen = handleToggleElectronFullscreen

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

  // Overview mode
  if (viewMode === 'overview') {
    const overviewContent = (
      <div className={isFullscreen ? 'h-full relative' : 'group'}>
        <div style={isFullscreen ? { height: '100%' } : { height: `${mapHeight}px` }} className="relative">
          {/* Mode toggle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex gap-0.5 bg-secondary rounded-lg p-0.5" style={{ zIndex: 20 }}>
            <button
              onClick={() => setViewMode('overview')}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md bg-card shadow-sm font-medium"
            >
              <Globe size={12} />
              {t('configMap.overview')}
            </button>
            <button
              onClick={() => setViewMode('detail')}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen size={12} />
              {t('configMap.detailView')}
            </button>
          </div>
          {/* Fullscreen toggle */}
          <div className="absolute top-2 right-2 z-10 flex gap-1" style={{ zIndex: 20 }}>
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded transition-colors hover:opacity-80"
              style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
              title={isFullscreen ? t('configMap.exitFullscreen') : t('configMap.fullscreen')}
            >
              {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          <ConfigMapOverview workspaces={workspaces} onDrillDown={handleDrillDown} />
        </div>
        {/* Resize handle (not in fullscreen) */}
        {!isFullscreen && (
          <div
            className="w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize py-1"
            onPointerDown={(e) => {
              e.preventDefault()
              const startY = e.clientY
              const startHeight = mapHeight
              const onMove = (me: PointerEvent): void => {
                const delta = me.clientY - startY
                setMapHeight(Math.max(300, Math.min(startHeight + delta, 1200)))
              }
              const onUp = (): void => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp)
            }}
          >
            <div className="h-1.5 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${palette.gray}80` }}>
              <GripHorizontal size={10} style={{ color: palette.textMuted }} />
            </div>
          </div>
        )}
      </div>
    )

    return overviewContent
  }

  // No project path resolved
  if (!resolvedPath) {
    return (
      <div
        className="w-full flex items-center justify-center border overflow-hidden font-mono relative rounded-md"
        style={{ backgroundColor: palette.bg, borderColor: palette.panelBorder, height: `${mapHeight}px` }}
      >
        <div className="text-sm tracking-widest opacity-50 flex flex-col items-center" style={{ color: palette.textMuted }}>
          <span className="mb-2 uppercase">[ {t('configMap.noWorkspace')} ]</span>
          <span className="text-xs">{t('configMap.selectWorkspace')}</span>
        </div>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div
        className="w-full flex items-center justify-center border overflow-hidden font-mono relative rounded-md"
        style={{ backgroundColor: palette.bg, borderColor: palette.panelBorder, height: `${mapHeight}px` }}
      >
        <span className="animate-pulse tracking-widest" style={{ color: palette.cyan }}>
          SCANNING CONFIG...
        </span>
      </div>
    )
  }

  const detailContent = (
    <div className={isFullscreen ? '' : 'group'}>
    <div className="flex w-full" style={isFullscreen ? { height: '100%' } : { height: `${mapHeight}px` }}>
      {/* Main SVG area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mode toggle + Workspace selector */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0" style={{ borderColor: palette.panelBorder }}>
          <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('overview')}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe size={11} />
              {t('configMap.overview')}
            </button>
            <button
              onClick={() => setViewMode('detail')}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-card shadow-sm font-medium"
            >
              <FolderOpen size={11} />
              {t('configMap.detailView')}
            </button>
          </div>
        </div>

        {/* Workspace selector */}
        {availablePaths.size > 1 && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border-b overflow-x-auto shrink-0"
            style={{ borderColor: palette.panelBorder }}
          >
            {Array.from(availablePaths.entries()).map(([path, name]) => (
              <button
                key={path}
                onClick={() => setSelectedPath(path)}
                className="px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: resolvedPath === path ? palette.cyan + '20' : 'transparent',
                  color: resolvedPath === path ? palette.cyan : palette.textMuted,
                  border: `1px solid ${resolvedPath === path ? palette.cyan + '40' : palette.panelBorder}`
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Conflict summary bar */}
        {data && data.conflicts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b" style={{ borderColor: palette.panelBorder, backgroundColor: 'rgba(239,68,68,0.05)' }}>
            <span style={{ color: palette.red }}>&#x26A0;</span>
            <span style={{ color: palette.red }}>
              {data.conflicts.length} {t('configMap.conflictsFound')}
            </span>
            <span style={{ color: palette.textMuted }}>
              {data.conflicts.map(c => c.description).join(' | ')}
            </span>
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 rounded-md border shadow-xl overflow-hidden select-none cursor-grab active:cursor-grabbing relative"
          style={{
            backgroundColor: palette.bg,
            borderColor: palette.panelBorder
          }}
          onMouseMove={handleContainerMouseMove}
        >
          {/* Grid background */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(${palette.accent} 1px, transparent 1px), linear-gradient(90deg, ${palette.accent} 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
              backgroundPosition: `${pan.x}px ${pan.y}px`,
              opacity: 0.06
            }}
          />

          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full block"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <filter id="config-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker id="arrow-inherits" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.cyan} opacity={0.9} />
              </marker>
              <marker id="arrow-overrides" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.red} opacity={0.9} />
              </marker>
              <marker id="arrow-configures" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.gray} opacity={0.9} />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              {/* Group sector arcs (subtle background zones) */}
              {GROUP_DEFS.map(gd => {
                if (!activeGroups.has(gd.group)) return null
                const groupColor = gd.color === 'cyan' ? palette.cyan :
                                   gd.color === 'green' ? palette.green :
                                   gd.color === 'orange' ? palette.orange :
                                   palette.purple
                return (
                  <g key={gd.group}>
                    {/* Inner arc */}
                    <path
                      d={describeArc(cx, cy, 160, gd.startAngle, gd.endAngle)}
                      fill="none"
                      stroke={groupColor}
                      strokeWidth={0.5}
                      opacity={0.15}
                    />
                    {/* Outer arc */}
                    <path
                      d={describeArc(cx, cy, 340, gd.startAngle, gd.endAngle)}
                      fill="none"
                      stroke={groupColor}
                      strokeWidth={0.5}
                      opacity={0.1}
                    />
                    {/* Group label on outer arc */}
                    {(() => {
                      const midAngle = ((gd.startAngle + gd.endAngle) / 2 * Math.PI) / 180
                      const labelR = 355
                      const lx = cx + labelR * Math.cos(midAngle)
                      const ly = cy + labelR * Math.sin(midAngle)
                      return (
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="font-mono uppercase"
                          fontSize={9}
                          fill={groupColor}
                          opacity={0.35}
                          letterSpacing={2}
                          style={{ userSelect: 'none' }}
                        >
                          {gd.label}
                        </text>
                      )
                    })()}
                  </g>
                )
              })}

              {/* Center: project label */}
              <circle cx={cx} cy={cy} r={42} fill={palette.bg} stroke={palette.cyan} strokeWidth={1} opacity={0.6} />
              <circle cx={cx} cy={cy} r={38} fill="none" stroke={palette.cyan} strokeWidth={0.5} opacity={0.2} />
              <text
                x={cx} y={cy - 5}
                textAnchor="middle"
                className="font-mono"
                fontSize={11}
                fill={palette.cyan}
                fontWeight="bold"
                style={{ userSelect: 'none' }}
              >
                {data?.projectName || ''}
              </text>
              <text
                x={cx} y={cy + 9}
                textAnchor="middle"
                className="font-mono uppercase"
                fontSize={7}
                fill={palette.textMuted}
                style={{ userSelect: 'none' }}
              >
                {t('configMap.title')}
              </text>

              {/* Category sector labels */}
              {data && Object.entries(CATEGORY_SECTORS).map(([cat, sector]) => {
                const hasNodes = data.nodes.some(n => n.category === cat)
                if (!hasNodes) return null
                const angle = (sector.angle * Math.PI) / 180
                const labelR = sector.baseRadius - 40
                const lx = cx + labelR * Math.cos(angle)
                const ly = cy + labelR * Math.sin(angle)
                return (
                  <text
                    key={cat}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="font-mono uppercase"
                    fontSize={7}
                    fill={palette.textMuted}
                    opacity={0.4}
                    style={{ userSelect: 'none' }}
                  >
                    {t('configMap.category.' + cat)}
                  </text>
                )
              })}

              {/* Edges */}
              {data?.edges.map((edge, i) => {
                const from = nodePositions.get(edge.from)
                const to = nodePositions.get(edge.to)
                if (!from || !to) return null
                const style = EDGE_STYLES[edge.relationship] || EDGE_STYLES.references
                const color = style.stroke === 'cyan' ? palette.cyan :
                              style.stroke === 'red' ? palette.red :
                              style.stroke === 'accent' ? palette.accent :
                              palette.gray
                const markerId = edge.relationship === 'references' ? '' : `url(#arrow-${edge.relationship})`

                // Shorten line to avoid overlapping node circles
                const dx = to.x - from.x
                const dy = to.y - from.y
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < 1) return null
                const nx = dx / dist
                const ny = dy / dist
                const startOffset = 32
                const endOffset = 32
                return (
                  <line
                    key={`edge-${i}`}
                    x1={from.x + nx * startOffset}
                    y1={from.y + ny * startOffset}
                    x2={to.x - nx * endOffset}
                    y2={to.y - ny * endOffset}
                    stroke={color}
                    strokeWidth={style.width}
                    strokeDasharray={style.dasharray}
                    markerEnd={markerId}
                    opacity={0.8}
                  />
                )
              })}

              {/* Nodes */}
              {data?.nodes.map((node) => {
                const pos = nodePositions.get(node.id)
                if (!pos) return null
                return (
                  <ConfigMapNode
                    key={node.id}
                    node={node}
                    x={pos.x}
                    y={pos.y}
                    palette={palette}
                    isConflicted={conflictedNodeIds.has(node.id)}
                    isSelected={selectedNode?.id === node.id}
                    onClick={handleNodeClick}
                    onHoverChange={handleNodeHoverChange}
                  />
                )
              })}
            </g>
          </svg>

          {/* Legend */}
          <div
            className="absolute bottom-2 left-2 px-3 py-2 rounded text-[9px] font-mono flex flex-col gap-1.5"
            style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}` }}
          >
            {/* Level colors (bottom stripe on nodes) */}
            <div className="flex gap-3">
              <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.level')}:</span>
              <span style={{ color: palette.cyan }}>&#9644; {t('configMap.levelGlobal')}</span>
              <span style={{ color: palette.green }}>&#9644; {t('configMap.levelProject')}</span>
              <span style={{ color: palette.purple }}>&#9644; {t('configMap.levelAgent')}</span>
            </div>
            {/* Category colors (node border) */}
            <div className="flex gap-2 flex-wrap">
              <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.category.label')}:</span>
              <span style={{ color: palette.cyan }}>&#9679; {t('configMap.category.rules')}</span>
              <span style={{ color: palette.green }}>&#9679; {t('configMap.category.mcpServers')}</span>
              <span style={{ color: palette.orange }}>&#9679; {t('configMap.category.skills')}/{t('configMap.category.commands')}/{t('configMap.category.templates')}</span>
              <span style={{ color: palette.red }}>&#9679; {t('configMap.category.hooks')}</span>
              <span style={{ color: palette.purple }}>&#9679; {t('configMap.category.memory')}/{t('configMap.category.agents')}</span>
              <span style={{ color: palette.gray }}>&#9679; {t('configMap.category.settings')}</span>
            </div>
            {/* Edge types */}
            <div className="flex gap-3">
              <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.edges')}:</span>
              <span style={{ color: palette.cyan }}>— {t('configMap.relationship.inherits')}</span>
              <span style={{ color: palette.red }}>╌ {t('configMap.relationship.overrides')}</span>
              <span style={{ color: palette.accent }}>┈ {t('configMap.relationship.references')}</span>
              <span style={{ color: palette.gray }}>╌ {t('configMap.relationship.configures')}</span>
            </div>
          </div>

          {/* Node count */}
          {data && (
            <div
              className="absolute top-2 right-2 px-2 py-1 rounded text-[9px] font-mono"
              style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
            >
              {data.nodes.length} {t('configMap.nodes')} / {data.edges.length} {t('configMap.edges')}
            </div>
          )}

          {/* Hover tooltip (HTML overlay, always on top) */}
          {hoveredNode && (
            <div
              className="absolute pointer-events-none font-mono"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.y,
                zIndex: 50,
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                borderRadius: 6,
                padding: '8px 10px',
                maxWidth: 220,
                backdropFilter: 'blur(8px)',
                transform: 'translateY(-100%)'
              }}
            >
              <div className="text-[11px] font-bold mb-1" style={{ color: palette.textMain }}>
                {hoveredNode.label}
              </div>
              <div className="text-[10px] mb-0.5" style={{ color: palette.textMuted }}>
                {t('configMap.category.' + hoveredNode.category)} / {hoveredNode.level}
              </div>
              {(hoveredNode.lineCount > 0 || hoveredNode.sizeBytes > 0) && (
                <div className="text-[10px] mb-0.5" style={{ color: palette.textMuted }}>
                  {hoveredNode.lineCount > 0 ? `${hoveredNode.lineCount} lines` : ''}
                  {hoveredNode.sizeBytes > 0 ? ` (${(hoveredNode.sizeBytes / 1024).toFixed(1)}KB)` : ''}
                </div>
              )}
              {hoveredNode.preview && (
                <div className="text-[9px] mt-1 opacity-70 line-clamp-2" style={{ color: palette.textMuted }}>
                  {hoveredNode.preview.slice(0, 80).replace(/\n/g, ' ')}
                </div>
              )}
              {conflictedNodeIds.has(hoveredNode.id) && (
                <div className="text-[10px] mt-1 font-bold" style={{ color: palette.red }}>
                  {t('configMap.conflictWarning')}
                </div>
              )}
            </div>
          )}

          {/* Zoom controls */}
          <div
            className="absolute bottom-2 right-2 flex flex-col gap-1 pointer-events-auto"
            style={{ zIndex: 20 }}
          >
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded transition-colors hover:opacity-80"
              style={{
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                color: palette.textMuted
              }}
              title={isFullscreen ? t('configMap.exitFullscreen') : t('configMap.fullscreen')}
            >
              {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
            </button>

            <div className="h-px" />

            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded transition-colors hover:opacity-80"
              style={{
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                color: palette.textMuted
              }}
              title={t('configMap.zoomIn')}
            >
              <Plus size={14} />
            </button>

            {/* Scale indicator */}
            <div
              className="text-center text-[9px] font-mono py-0.5 rounded"
              style={{
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                color: palette.textMuted,
                minWidth: '30px'
              }}
            >
              {Math.round(scale * 100)}%
            </div>

            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded transition-colors hover:opacity-80"
              style={{
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                color: palette.textMuted
              }}
              title={t('configMap.zoomOut')}
            >
              <Minus size={14} />
            </button>

            <div className="h-px" />

            <button
              onClick={handleZoomFit}
              className="p-1.5 rounded transition-colors hover:opacity-80"
              style={{
                backgroundColor: palette.panelBg,
                border: `1px solid ${palette.panelBorder}`,
                color: palette.textMuted
              }}
              title={t('configMap.zoomFit')}
            >
              <Maximize size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && data && (
        <ConfigMapDetailPanel
          node={selectedNode}
          conflicts={data.conflicts}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>

    {/* Field Size Adjust Handle (not in fullscreen) */}
    {!isFullscreen && (
      <div
        className="w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize py-1"
        onPointerDown={(e) => {
          e.preventDefault()
          const startY = e.clientY
          const startHeight = mapHeight
          const onMove = (me: PointerEvent): void => {
            const delta = me.clientY - startY
            setMapHeight(Math.max(300, Math.min(startHeight + delta, 1200)))
          }
          const onUp = (): void => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }}
      >
        <div className="h-1.5 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${palette.gray}80` }}>
          <GripHorizontal size={10} style={{ color: palette.textMuted }} />
        </div>
      </div>
    )}
    </div>
  )

  return detailContent
}
