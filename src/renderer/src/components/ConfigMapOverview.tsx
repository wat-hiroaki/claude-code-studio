import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Minus, Maximize } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import type { WorkspaceConfigSummary, Workspace } from '@shared/types'

// ---------------------------------------------------------
// CYBER/HUD THEME
// ---------------------------------------------------------
const cyberPaletteDark = {
  bg: '#09090b',
  accent: '#71717a',
  cyan: '#0ea5e9',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#52525b',
  darkGray: '#18181b',
  textMain: '#fafafa',
  textMuted: '#a1a1aa',
  panelBg: 'rgba(9, 9, 11, 0.9)',
  panelBorder: 'rgba(82, 82, 91, 0.5)'
}

const cyberPaletteLight = {
  bg: '#f8fafc',
  accent: '#64748b',
  cyan: '#0284c7',
  green: '#059669',
  orange: '#d97706',
  red: '#dc2626',
  purple: '#7c3aed',
  gray: '#94a3b8',
  darkGray: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  panelBg: 'rgba(255, 255, 255, 0.95)',
  panelBorder: 'rgba(148, 163, 184, 0.5)'
}

function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useAppStore()
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

// Layout: arrange workspace nodes in a grid/ring
function getWorkspacePositions(
  summaries: WorkspaceConfigSummary[],
  cx: number,
  cy: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const count = summaries.length

  if (count === 0) return positions

  if (count === 1) {
    positions.set(summaries[0].projectPath, { x: cx, y: cy })
    return positions
  }

  if (count <= 6) {
    // Ring layout
    const radius = 220
    for (let i = 0; i < count; i++) {
      const angle = ((i / count) * Math.PI * 2) - Math.PI / 2
      positions.set(summaries[i].projectPath, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      })
    }
  } else {
    // Grid layout
    const cols = Math.ceil(Math.sqrt(count))
    const spacing = 250
    const startX = cx - ((cols - 1) * spacing) / 2
    const startY = cy - ((Math.ceil(count / cols) - 1) * spacing) / 2
    for (let i = 0; i < count; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      positions.set(summaries[i].projectPath, {
        x: startX + col * spacing,
        y: startY + row * spacing
      })
    }
  }

  return positions
}

interface ConfigMapOverviewProps {
  workspaces: Workspace[]
  onDrillDown: (projectPath: string) => void
}

export function ConfigMapOverview({ workspaces, onDrillDown }: ConfigMapOverviewProps): JSX.Element {
  const { t } = useTranslation()
  const resolved = useResolvedTheme()
  const palette = resolved === 'dark' ? cyberPaletteDark : cyberPaletteLight
  const { agents } = useAppStore()

  const [summaries, setSummaries] = useState<WorkspaceConfigSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Pan/zoom
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const svgWidth = 1200
  const svgHeight = 800
  const cx = svgWidth / 2
  const cy = svgHeight / 2

  // Collect all project paths
  const projectPaths = useMemo(() => {
    const isHomePath = (p: string): boolean => {
      const normalized = p.replace(/[\\/]+$/, '')
      return normalized === '~' || normalized === '~/' ||
        /^[A-Z]:[\\/]Users[\\/][^\\/]+$/.test(normalized) ||
        /^\/home\/[^/]+$/.test(normalized) ||
        /^\/Users\/[^/]+$/.test(normalized)
    }
    const paths = new Set<string>()
    for (const ws of workspaces) {
      if (!isHomePath(ws.path)) paths.add(ws.path)
    }
    for (const agent of agents) {
      if (agent.projectPath && !isHomePath(agent.projectPath)) paths.add(agent.projectPath)
    }
    return Array.from(paths)
  }, [workspaces, agents])

  // Load summaries
  useEffect(() => {
    if (projectPaths.length === 0) return
    let cancelled = false
    setLoading(true)
    window.api.getOrgOverview(projectPaths).then((result) => {
      if (!cancelled) {
        setSummaries(result)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPaths])

  // Wheel zoom
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
  }, [loading])

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

  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (hoveredPath && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 })
    }
  }, [hoveredPath])

  const handleZoomIn = useCallback(() => setScale(s => Math.min(4, s + 0.2)), [])
  const handleZoomOut = useCallback(() => setScale(s => Math.max(0.3, s - 0.2)), [])
  const handleZoomFit = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [])

  const positions = useMemo(() => getWorkspacePositions(summaries, cx, cy), [summaries, cx, cy])

  const hoveredSummary = hoveredPath ? summaries.find(s => s.projectPath === hoveredPath) : null

  // Count active agents per workspace
  const agentCountByPath = useMemo(() => {
    const map = new Map<string, number>()
    for (const agent of agents) {
      if (agent.projectPath && agent.status !== 'archived') {
        map.set(agent.projectPath, (map.get(agent.projectPath) || 0) + 1)
      }
    }
    return map
  }, [agents])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full font-mono" style={{ color: palette.cyan }}>
        <span className="animate-pulse tracking-widest">SCANNING ORGANIZATION...</span>
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full font-mono" style={{ color: palette.textMuted }}>
        <span className="tracking-widest text-sm opacity-50">[ NO WORKSPACES ]</span>
      </div>
    )
  }

  // Workspace node radius scales with total nodes
  const getNodeRadius = (s: WorkspaceConfigSummary): number => {
    return Math.max(50, Math.min(80, 40 + s.totalNodes * 2))
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-md border shadow-xl overflow-hidden select-none cursor-grab active:cursor-grabbing relative"
      style={{ backgroundColor: palette.bg, borderColor: palette.panelBorder }}
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
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-full block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {/* Center: Global Config hub */}
          <circle cx={cx} cy={cy} r={30} fill={palette.bg} stroke={palette.cyan} strokeWidth={1} opacity={0.4} />
          <text
            x={cx} y={cy - 3}
            textAnchor="middle"
            className="font-mono uppercase"
            fontSize={8}
            fill={palette.cyan}
            opacity={0.6}
            style={{ userSelect: 'none' }}
          >
            GLOBAL
          </text>
          <text
            x={cx} y={cy + 8}
            textAnchor="middle"
            className="font-mono uppercase"
            fontSize={6}
            fill={palette.textMuted}
            opacity={0.4}
            style={{ userSelect: 'none' }}
          >
            ~/.claude
          </text>

          {/* Connections from global to each workspace */}
          {summaries.map(s => {
            const pos = positions.get(s.projectPath)
            if (!pos) return null
            const dx = pos.x - cx
            const dy = pos.y - cy
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 1) return null
            const nx = dx / dist
            const ny = dy / dist
            const r = getNodeRadius(s)
            return (
              <line
                key={`edge-${s.projectPath}`}
                x1={cx + nx * 32}
                y1={cy + ny * 32}
                x2={pos.x - nx * (r + 2)}
                y2={pos.y - ny * (r + 2)}
                stroke={palette.cyan}
                strokeWidth={0.8}
                strokeDasharray="4 6"
                opacity={0.2}
              />
            )
          })}

          {/* Shared MCP connections between workspaces */}
          {summaries.map((a, i) =>
            summaries.slice(i + 1).map(b => {
              const shared = a.mcpServerNames.filter(s => b.mcpServerNames.includes(s))
              if (shared.length === 0) return null
              const posA = positions.get(a.projectPath)
              const posB = positions.get(b.projectPath)
              if (!posA || !posB) return null
              return (
                <line
                  key={`shared-${a.projectPath}-${b.projectPath}`}
                  x1={posA.x}
                  y1={posA.y}
                  x2={posB.x}
                  y2={posB.y}
                  stroke={palette.green}
                  strokeWidth={0.6}
                  strokeDasharray="2 4"
                  opacity={0.15}
                />
              )
            })
          )}

          {/* Workspace nodes */}
          {summaries.map(s => {
            const pos = positions.get(s.projectPath)
            if (!pos) return null
            const r = getNodeRadius(s)
            const isHovered = hoveredPath === s.projectPath
            const activeAgents = agentCountByPath.get(s.projectPath) || 0
            const hasConflicts = s.conflictCount > 0

            return (
              <g
                key={s.projectPath}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => onDrillDown(s.projectPath)}
                onMouseEnter={() => setHoveredPath(s.projectPath)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                {/* Hover glow */}
                {isHovered && (
                  <circle r={r + 8} fill="none" stroke={palette.cyan} strokeWidth={1.5} opacity={0.3} />
                )}

                {/* Conflict ring */}
                {hasConflicts && (
                  <circle r={r + 4} fill="none" stroke={palette.red} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6}>
                    <animateTransform attributeName="transform" type="rotate" dur="10s" repeatCount="indefinite" from="0 0 0" to="360 0 0" />
                  </circle>
                )}

                {/* Main circle */}
                <circle
                  r={r}
                  fill={palette.bg}
                  stroke={isHovered ? palette.cyan : palette.accent}
                  strokeWidth={isHovered ? 2 : 1}
                  opacity={0.95}
                />

                {/* Inner ring showing relative composition */}
                <circle r={r * 0.65} fill="none" stroke={palette.accent} strokeWidth={0.5} opacity={0.2} />

                {/* Project name */}
                <text
                  textAnchor="middle"
                  y={-8}
                  className="font-mono"
                  fontSize={11}
                  fill={palette.textMain}
                  fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >
                  {s.projectName.length > 16 ? s.projectName.slice(0, 14) + '..' : s.projectName}
                </text>

                {/* Stats row */}
                <text
                  textAnchor="middle"
                  y={8}
                  className="font-mono"
                  fontSize={8}
                  fill={palette.textMuted}
                  style={{ userSelect: 'none' }}
                >
                  {s.totalNodes} nodes
                </text>

                {/* Active agents badge */}
                {activeAgents > 0 && (
                  <g transform={`translate(${r * 0.7}, ${-r * 0.7})`}>
                    <circle r={10} fill={palette.green} opacity={0.9} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9}
                      fill="#fff"
                      fontWeight="bold"
                      style={{ userSelect: 'none' }}
                    >
                      {activeAgents}
                    </text>
                  </g>
                )}

                {/* Conflict badge */}
                {hasConflicts && (
                  <g transform={`translate(${-r * 0.7}, ${-r * 0.7})`}>
                    <circle r={8} fill={palette.red} opacity={0.9} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={8}
                      fill="#fff"
                      style={{ userSelect: 'none' }}
                    >
                      !
                    </text>
                  </g>
                )}

                {/* Project CLAUDE.md indicator */}
                {s.hasProjectClaude && (
                  <circle cx={0} cy={r - 2} r={3} fill={palette.green} opacity={0.7} />
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Hover tooltip */}
      {hoveredSummary && (
        <div
          className="absolute pointer-events-none font-mono"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 50,
            backgroundColor: palette.panelBg,
            border: `1px solid ${palette.panelBorder}`,
            borderRadius: 6,
            padding: '10px 12px',
            maxWidth: 280,
            backdropFilter: 'blur(8px)',
            transform: 'translateY(-100%)'
          }}
        >
          <div className="text-[12px] font-bold mb-1.5" style={{ color: palette.textMain }}>
            {hoveredSummary.projectName}
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] mb-2" style={{ color: palette.textMuted }}>
            <span>Rules: {hoveredSummary.nodeCounts.rules}</span>
            <span>Skills: {hoveredSummary.nodeCounts.skills}</span>
            <span>Commands: {hoveredSummary.nodeCounts.commands}</span>
            <span>MCP: {hoveredSummary.nodeCounts.mcpServers}</span>
            <span>Hooks: {hoveredSummary.nodeCounts.hooks}</span>
            <span>Memory: {hoveredSummary.nodeCounts.memory}</span>
            <span>Agents: {hoveredSummary.nodeCounts.agents}</span>
            <span>Templates: {hoveredSummary.nodeCounts.templates}</span>
            <span>Settings: {hoveredSummary.nodeCounts.settings}</span>
          </div>
          {hoveredSummary.agentNames.length > 0 && (
            <div className="text-[9px] mb-1" style={{ color: palette.purple }}>
              Agents: {hoveredSummary.agentNames.join(', ')}
            </div>
          )}
          {hoveredSummary.mcpServerNames.length > 0 && (
            <div className="text-[9px] mb-1" style={{ color: palette.green }}>
              MCP: {hoveredSummary.mcpServerNames.join(', ')}
            </div>
          )}
          {hoveredSummary.conflictCount > 0 && (
            <div className="text-[9px] font-bold" style={{ color: palette.red }}>
              {hoveredSummary.conflictCount} conflict(s)
            </div>
          )}
          <div className="text-[8px] mt-1 opacity-50" style={{ color: palette.textMuted }}>
            Click to drill down
          </div>
        </div>
      )}

      {/* Title */}
      <div
        className="absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.cyan }}
      >
        {t('configMap.orgOverview')}
      </div>

      {/* Workspace count */}
      <div
        className="absolute top-2 right-2 px-2 py-1 rounded text-[9px] font-mono"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
      >
        {summaries.length} {t('configMap.workspaces')}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 pointer-events-auto" style={{ zIndex: 20 }}>
        <button onClick={handleZoomIn} className="p-1.5 rounded transition-colors hover:opacity-80" style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }} title={t('configMap.zoomIn')}>
          <Plus size={14} />
        </button>
        <div className="text-center text-[9px] font-mono py-0.5 rounded" style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted, minWidth: '30px' }}>
          {Math.round(scale * 100)}%
        </div>
        <button onClick={handleZoomOut} className="p-1.5 rounded transition-colors hover:opacity-80" style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }} title={t('configMap.zoomOut')}>
          <Minus size={14} />
        </button>
        <div className="h-px" />
        <button onClick={handleZoomFit} className="p-1.5 rounded transition-colors hover:opacity-80" style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }} title={t('configMap.zoomFit')}>
          <Maximize size={14} />
        </button>
      </div>

      {/* Legend */}
      <div
        className="absolute bottom-2 left-2 px-3 py-2 rounded text-[9px] font-mono flex flex-col gap-1"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}` }}
      >
        <div className="flex gap-3">
          <span style={{ color: palette.green }}>● {t('configMap.orgActiveAgents')}</span>
          <span style={{ color: palette.red }}>! {t('configMap.conflicts')}</span>
          <span style={{ color: palette.green }}>◦ CLAUDE.md</span>
        </div>
        <div className="flex gap-3" style={{ color: palette.textMuted }}>
          <span>--- {t('configMap.orgGlobalLink')}</span>
          <span style={{ color: palette.green }}>--- {t('configMap.orgSharedMcp')}</span>
        </div>
      </div>
    </div>
  )
}
