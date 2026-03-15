import { useMemo, useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { getInitials } from '../lib/status'
import { PtyTerminalView } from './PtyTerminalView'
import { TerminalView } from './TerminalView'
import { Composer } from './Composer'
import { X, GripHorizontal, Maximize2, Pencil, Check } from 'lucide-react'
import type { Agent, AgentStatus, Team, Workspace } from '@shared/types'

interface ActivityMapProps {
  teams: Team[]
  onAgentClick: (id: string) => void
}

// ---------------------------------------------------------
// CYBER/HUD THEME DEFINITIONS (Dual Palette)
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
  grid: '#18181b',
  textMain: '#fafafa',
  textMuted: '#a1a1aa',
  panelBg: 'rgba(9, 9, 11, 0.9)',
  panelBorder: 'rgba(82, 82, 91, 0.5)',
  cockpitBg: '#09090b',
  cockpitHeaderBg: 'rgba(24, 24, 27, 0.5)',
  cockpitBorder: '#3f3f46'
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
  grid: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  panelBg: 'rgba(255, 255, 255, 0.95)',
  panelBorder: 'rgba(148, 163, 184, 0.5)',
  cockpitBg: '#ffffff',
  cockpitHeaderBg: 'rgba(241, 245, 249, 0.8)',
  cockpitBorder: '#cbd5e1'
}

type CyberPalette = typeof cyberPaletteDark

function useResolvedTheme(): 'dark' | 'light' {
  const { theme } = useAppStore()
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

function useCyberPalette(): CyberPalette {
  const resolved = useResolvedTheme()
  return resolved === 'dark' ? cyberPaletteDark : cyberPaletteLight
}

type CyberStyle = { color: string; glow: string; label: string }

function getStatusTheme(palette: CyberPalette): Record<AgentStatus, CyberStyle> {
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

// Helper: Calculate positions around a center
function getRadialPosition(index: number, total: number, centerX: number, centerY: number, radius: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  }
}

function groupByTeam(agents: Agent[], teams: Team[]) {
  const groups: { team: Team | null; agents: Agent[] }[] = teams.map((t) => ({ team: t, agents: agents.filter((a) => a.teamId === t.id) }))
  const unassigned = agents.filter((a) => !a.teamId)
  if (unassigned.length > 0) groups.push({ team: null, agents: unassigned })
  return groups.filter((g) => g.agents.length > 0)
}

// ---------------------------------------------------------
// AGENT NODE (TARGET HUD)
// ---------------------------------------------------------
interface AgentNodeProps {
  agent: Agent
  x: number
  y: number
  onClick: (id: string) => void
  palette: CyberPalette
  statusTheme: Record<AgentStatus, CyberStyle>
  workspaceName: string
  memoryMB: number
}

function AgentNode({ agent, x, y, onClick, palette, statusTheme, workspaceName, memoryMB }: AgentNodeProps) {
  const [hovered, setHovered] = useState(false)
  const theme = statusTheme[agent.status]
  const isActive = ['active', 'thinking', 'tool_running', 'awaiting'].includes(agent.status)
  const isDanger = agent.status === 'error'

  const coreRadius = 12
  const crosshairOffset = 24
  const ringRadius = 18

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(agent.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ターゲットロックオンのクロスヘア */}
      <path
        d={`M ${x - crosshairOffset} ${y - crosshairOffset} L ${x - crosshairOffset + 8} ${y - crosshairOffset} M ${x - crosshairOffset} ${y - crosshairOffset} L ${x - crosshairOffset} ${y - crosshairOffset + 8}
            M ${x + crosshairOffset} ${y - crosshairOffset} L ${x + crosshairOffset - 8} ${y - crosshairOffset} M ${x + crosshairOffset} ${y - crosshairOffset} L ${x + crosshairOffset} ${y - crosshairOffset + 8}
            M ${x - crosshairOffset} ${y + crosshairOffset} L ${x - crosshairOffset + 8} ${y + crosshairOffset} M ${x - crosshairOffset} ${y + crosshairOffset} L ${x - crosshairOffset} ${y + crosshairOffset - 8}
            M ${x + crosshairOffset} ${y + crosshairOffset} L ${x + crosshairOffset - 8} ${y + crosshairOffset} M ${x + crosshairOffset} ${y + crosshairOffset} L ${x + crosshairOffset} ${y + crosshairOffset - 8}`}
        stroke={hovered ? palette.textMain : theme.color}
        strokeWidth={1.2}
        fill="none"
        opacity={hovered ? 0.8 : 0.35}
      />

      {/* 外側の回転リング (アクティブ時のみ) */}
      {isActive && (
        <circle cx={x} cy={y} r={ringRadius} fill="none" stroke={theme.color} strokeWidth={0.6} strokeDasharray="3 5" opacity={0.5}>
          <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* エラー時の警告リップル */}
      {isDanger && (
        <circle cx={x} cy={y} r={coreRadius} fill="none" stroke={theme.color} strokeWidth={1.5}>
          <animate attributeName="r" values={`${coreRadius}; ${coreRadius + 14}`} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1; 0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* コアサークル */}
      <circle
        cx={x}
        cy={y}
        r={coreRadius}
        fill={palette.bg}
        stroke={theme.color}
        strokeWidth={1.8}
        filter={isDanger ? 'url(#cyber-glow)' : ''}
      />
      {/* 内部コア */}
      <circle cx={x} cy={y} r={4} fill={theme.color} opacity={0.8} className={isActive ? 'animate-pulse' : ''} />

      {/* テキスト - Initials */}
      <text x={x} y={y - 28} textAnchor="middle" className="font-mono text-[11px] tracking-widest font-bold" fill={theme.color} style={{ userSelect: 'none' }}>
        {getInitials(agent.name)}
      </text>

      {/* エージェント名 */}
      <text x={x} y={y + 30} textAnchor="middle" className="font-mono text-[11px] uppercase tracking-wider font-semibold" fill={palette.textMain} style={{ userSelect: 'none' }}>
        {agent.name.length > 12 ? agent.name.slice(0, 11) + '..' : agent.name}
      </text>

      {/* ワークスペース名 */}
      <text x={x} y={y + 44} textAnchor="middle" className="font-mono text-[8.5px] uppercase tracking-wider" fill={palette.textMuted} style={{ userSelect: 'none', opacity: 0.85 }}>
        WKSP: {workspaceName.slice(0, 14)}
      </text>

      {/* ステータスバッジ */}
      <rect x={x - 28} y={y + 49} width={56} height={14} fill={theme.color} opacity={0.2} rx={3} />
      <text x={x} y={y + 59} textAnchor="middle" className="font-mono text-[8px] font-bold uppercase tracking-widest" fill={theme.color} style={{ userSelect: 'none' }}>
        {theme.label}
      </text>

      {/* メモリ使用量 */}
      {memoryMB > 0 && (
        <text x={x} y={y + 72} textAnchor="middle" className="font-mono text-[7.5px] font-medium" fill={memoryMB > 2048 ? palette.red : memoryMB > 1024 ? palette.orange : palette.textMuted} style={{ userSelect: 'none' }}>
          MEM: {memoryMB >= 1024 ? `${(memoryMB / 1024).toFixed(1)}GB` : `${memoryMB}MB`}
        </text>
      )}

      {/* Hover Info Panel (Sleek Tooltip) */}
      {hovered && (
        <foreignObject x={x + 30} y={y - 45} width={200} height={120} style={{ overflow: 'visible', zIndex: 100 }}>
          <div
            className="border shadow-xl relative rounded"
            style={{
              backgroundColor: palette.panelBg,
              borderColor: palette.panelBorder,
              backdropFilter: 'blur(8px)',
              padding: '10px 12px',
              fontFamily: 'monospace',
              fontSize: '10px',
              color: palette.textMain
            }}
          >
            {/* Corner tech accent */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l" style={{ borderColor: theme.color }} />

            <div style={{ color: palette.textMain, fontWeight: 'bold', fontSize: '11px', borderBottom: `1px solid ${palette.panelBorder}`, paddingBottom: '4px', marginBottom: '6px' }}>
              {agent.name}
            </div>

            <div className="flex justify-between mb-1 opacity-90">
              <span style={{ color: palette.textMuted }}>STATUS</span>
              <span style={{ color: theme.color }}>{agent.status}</span>
            </div>
            {workspaceName !== 'Default' && (
              <div className="flex justify-between mb-1 opacity-90">
                <span style={{ color: palette.textMuted }}>WORKSP</span>
                <span className="truncate ml-2 text-right">{workspaceName}</span>
              </div>
            )}
            {memoryMB > 0 && (
              <div className="flex justify-between mb-1 opacity-90">
                <span style={{ color: palette.textMuted }}>MEMORY</span>
                <span style={{ color: memoryMB > 2048 ? palette.red : memoryMB > 1024 ? palette.orange : palette.textMain }}>
                  {memoryMB >= 1024 ? `${(memoryMB / 1024).toFixed(1)} GB` : `${memoryMB} MB`}
                </span>
              </div>
            )}
            {agent.currentTask && (
              <div className="mt-2 text-[9px] leading-tight" style={{ color: palette.textMuted }}>
                <div className="mb-[2px] opacity-70">CURRENT TASK:</div>
                <div className="break-all">{agent.currentTask.slice(0, 60)}{agent.currentTask.length > 60 ? '...' : ''}</div>
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  )
}

// ---------------------------------------------------------
// CONNECTION LINES (DATA STREAMS)
// ---------------------------------------------------------
function DataStreams({ agents, positions, palette, statusTheme }: { agents: Agent[]; positions: Map<string, { x: number; y: number }>; palette: CyberPalette; statusTheme: Record<AgentStatus, CyberStyle> }) {
  const lines: { from: { x: number; y: number }; to: { x: number; y: number }; theme: CyberStyle }[] = []

  for (const agent of agents) {
    if (!agent.reportTo) continue
    const fromPos = positions.get(agent.id)
    const toPos = positions.get(agent.reportTo)
    const theme = statusTheme[agent.status]
    if (fromPos && toPos) lines.push({ from: fromPos, to: toPos, theme })
  }

  return (
    <g>
      {lines.map((line, i) => {
        const isActive = line.theme.color === palette.cyan || line.theme.color === palette.green || line.theme.color === palette.orange
        return (
          <g key={i}>
            {/* Base line */}
            <line
              x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}
              stroke={line.theme.color} strokeWidth={1} opacity={0.3}
            />
            {/* Animated data packets */}
            {isActive && (
              <g>
                <circle r={2} fill={line.theme.color} filter="url(#cyber-glow)">
                  <animateMotion dur={`${0.8 + Math.random() * 1}s`} repeatCount="indefinite" path={`M${line.from.x},${line.from.y} L${line.to.x},${line.to.y}`} />
                </circle>
                <line
                  x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}
                  stroke={line.theme.color} strokeWidth={2} strokeDasharray="10 20" opacity={0.6}
                >
                  <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1s" repeatCount="indefinite" />
                </line>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------
// CENTRAL SYSTEM HUB (MAGI / STARK CORE)
// ---------------------------------------------------------
function SystemCore({ cx, cy, stats, palette }: { cx: number; cy: number; stats: { total: number; active: number; error: number }; palette: CyberPalette }) {
  const isDanger = stats.error > 0
  const coreColor = isDanger ? palette.red : palette.accent

  return (
    <g>
      {/* Sleek Minimal Core Hexagon */}
      <polygon
        points={`${cx},${cy-45} ${cx+39},${cy-22.5} ${cx+39},${cy+22.5} ${cx},${cy+45} ${cx-39},${cy+22.5} ${cx-39},${cy-22.5}`}
        fill={palette.bg}
        stroke={coreColor}
        strokeWidth={1}
        opacity={0.8}
      />

      {/* Thin rotating ring */}
      <circle cx={cx} cy={cy} r={60} fill="none" stroke={coreColor} strokeWidth={0.5} strokeDasharray="10 30" opacity={0.3}>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="40s" repeatCount="indefinite" />
      </circle>

      {/* Core Text Elements */}
      <text x={cx} y={cy - 10} textAnchor="middle" className="font-mono font-bold tracking-[0.2em] text-[14px]" fill={palette.textMain} style={{ userSelect: 'none' }}>
        SYSTEM
      </text>

      {/* Health / Error display */}
      <text x={cx} y={cy + 12} textAnchor="middle" className="font-mono text-[11px] uppercase font-bold tracking-widest" fill={isDanger ? palette.red : palette.green} style={{ userSelect: 'none' }}>
        {isDanger ? 'ERR' : 'OK'}
      </text>

      {/* Online Stats */}
      <text x={cx} y={cy + 28} textAnchor="middle" className="font-mono text-[9px] font-medium" fill={palette.textMuted} style={{ userSelect: 'none' }}>
        NODES: {stats.active}/{stats.total}
      </text>
    </g>
  )
}

// ---------------------------------------------------------
// SECTOR LABELS
// ---------------------------------------------------------
type CyberSectorLabelProps = {
  team: Team | null;
  startAngle: number;
  endAngle: number;
  cx: number;
  cy: number;
  radius: number;
}
function CyberSectorLabel({ team, startAngle, endAngle, cx, cy, radius, palette }: CyberSectorLabelProps & { palette: CyberPalette }) {
  const midAngle = (startAngle + endAngle) / 2
  const textRadius = radius + 40
  const x = cx + textRadius * Math.cos(midAngle)
  const y = cy + textRadius * Math.sin(midAngle)

  const arcRadius = radius + 20
  const startX = cx + arcRadius * Math.cos(startAngle)
  const startY = cy + arcRadius * Math.sin(startAngle)
  const endX = cx + arcRadius * Math.cos(endAngle)
  const endY = cy + arcRadius * Math.sin(endAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0

  const arcLen = endAngle - startAngle
  const isTiny = arcLen < 0.2

  if (isTiny) return null

  return (
    <g>
      <path
        d={`M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${endX} ${endY}`}
        fill="none"
        stroke={team?.color || palette.gray}
        strokeWidth={2}
        opacity={0.5}
        strokeDasharray="4 4"
      />
      <rect x={x - 40} y={y - 8} width={80} height={16} fill={palette.bg} stroke={team?.color || palette.gray} strokeWidth={0.5} opacity={0.9} />
      <text x={x} y={y + 3} textAnchor="middle" className="font-mono text-[8px] uppercase tracking-wider" fill={team?.color || palette.textMain} style={{ userSelect: 'none' }}>
        SEC: {team?.name || 'UNASSIGNED'}
      </text>
    </g>
  )
}

// ---------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------
export function ActivityMap({ teams, onAgentClick }: ActivityMapProps) {
  const { agents, usePtyMode, updateAgentInList, agentMemory } = useAppStore()
  const palette = useCyberPalette()
  const statusTheme = useMemo(() => getStatusTheme(palette), [palette])

  // Memoize active agents by serialized IDs+statuses to prevent unnecessary recalculations
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
  const resolveWorkspaceName = (agent: Agent): string => {
    if (!agent.workspaceId) return 'Default'
    return workspaceNameMap.get(agent.workspaceId) ?? agent.workspaceId.split('/').pop()?.split('\\').pop() ?? 'Default'
  }

  // Pan, Zoom and Field Size States
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mapHeight, setMapHeight] = useState(500)
  const isDraggingMap = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Cockpit view state
  const [cockpitAgentId, setCockpitAgentId] = useState<string | null>(null)

  // Agent rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = (name: string) => {
    setRenameValue(name)
    setIsRenaming(true)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const commitRename = async (agentId: string) => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== agents.find(a => a.id === agentId)?.name) {
      await window.api.updateAgent(agentId, { name: trimmed })
      updateAgentInList(agentId, { name: trimmed })
    }
    setIsRenaming(false)
  }

  const handleAgentNodeClick = (id: string) => {
    setCockpitAgentId(id)
  }

  // Expanded HUD Canvas logical coords
  const svgWidth = 800
  const svgHeight = 600
  const centerX = svgWidth / 2
  const centerY = svgHeight / 2

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

  // Pan drag handles
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target instanceof SVGElement && e.target.tagName === 'svg') {
      isDraggingMap.current = true
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDraggingMap.current) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      lastMousePos.current = { x: e.clientX, y: e.clientY }
    }
  }
  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingMap.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const { positions, teamSectors } = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    const sectors: { team: Team | null; startAngle: number; endAngle: number }[] = []
    if (activeAgents.length === 0) return { positions: pos, teamSectors: sectors }

    const groups = groupByTeam(activeAgents, teams)
    const totalAgents = activeAgents.length
    const radius = 200 

    let currentIndex = 0
    for (const group of groups) {
      const startAngle = (2 * Math.PI * currentIndex) / totalAgents - Math.PI / 2
      for (let i = 0; i < group.agents.length; i++) {
        const position = getRadialPosition(currentIndex + i, totalAgents, centerX, centerY, radius)
        pos.set(group.agents[i].id, position)
      }
      const endAngle = (2 * Math.PI * (currentIndex + group.agents.length)) / totalAgents - Math.PI / 2
      sectors.push({ team: group.team, startAngle, endAngle })
      currentIndex += group.agents.length
    }
    return { positions: pos, teamSectors: sectors }
  }, [activeAgents, teams, centerX, centerY])

  const stats = useMemo(() => {
    const total = activeAgents.length
    const active = activeAgents.filter((a) => ['active', 'thinking', 'tool_running', 'awaiting'].includes(a.status)).length
    const error = activeAgents.filter((a) => a.status === 'error').length
    return { total, active, error }
  }, [activeAgents])

  if (activeAgents.length === 0) {
    return (
      <div className="w-full flex items-center justify-center aspect-video border overflow-hidden font-mono relative rounded-md" style={{ backgroundColor: palette.bg, borderColor: palette.cockpitBorder }}>
         <div className="text-sm tracking-widest opacity-50 flex flex-col items-center" style={{ color: palette.textMuted }}>
            <span className="mb-2 uppercase">[ NO AGENTS ONLINE ]</span>
            <span className="animate-pulse">AWAITING SYSTEM INITIALIZATION...</span>
         </div>
      </div>
    )
  }

  const cockpitAgent = cockpitAgentId ? agents.find(a => a.id === cockpitAgentId) : null

  return (
    <div className="flex flex-col gap-1 w-full relative group">
      <div
        className="w-full rounded-md border shadow-xl overflow-hidden select-none cursor-grab active:cursor-grabbing relative"
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.panelBorder,
          height: `${mapHeight}px`
        }}
      >
        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${palette.accent} 1px, transparent 1px), linear-gradient(90deg, ${palette.accent} 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            opacity: 0.06
          }}
        />

        {/* SVG Container */}
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
            <filter id="cyber-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Draggable/Zoomable Canvas Content */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ transformOrigin: `${centerX}px ${centerY}px` }}>
            {/* Structural Elements */}
            {teamSectors.map((s, i) => (
               <CyberSectorLabel key={i} {...s} cx={centerX} cy={centerY} radius={230} palette={palette} />
            ))}

            <DataStreams agents={activeAgents} positions={positions} palette={palette} statusTheme={statusTheme} />
            <SystemCore cx={centerX} cy={centerY} stats={stats} palette={palette} />

            {activeAgents.map((agent) => {
              const pos = positions.get(agent.id)
              if (!pos) return null
              return <AgentNode key={agent.id} agent={agent} x={pos.x} y={pos.y} onClick={handleAgentNodeClick} palette={palette} statusTheme={statusTheme} workspaceName={resolveWorkspaceName(agent)} memoryMB={agentMemory.get(agent.id) || 0} />
            })}
          </g>
          
          {/* Static Corner Decorators */}
          <g opacity={0.3}>
            <path d="M 20 50 L 20 20 L 50 20" fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} 50 L ${svgWidth - 20} 20 L ${svgWidth - 50} 20`} fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M 20 ${svgHeight - 50} L 20 ${svgHeight - 20} L 50 ${svgHeight - 20}`} fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} ${svgHeight - 50} L ${svgWidth - 20} ${svgHeight - 20} L ${svgWidth - 50} ${svgHeight - 20}`} fill="none" stroke={palette.accent} strokeWidth={1} />
          </g>

          {/* Footer info fixed to canvas bottom */}
          <text x={centerX} y={svgHeight - 15} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-[0.4em]" fill={palette.accent} opacity={0.5} style={{ userSelect: 'none' }}>
            CLAUDE-AGENTDECK :: TACTICAL OVERVIEW
          </text>
        </svg>

        {/* Cockpit Overlay */}
        {cockpitAgent && (
          <div
            className="absolute right-4 top-4 bottom-4 w-96 max-w-[50%] border rounded-lg shadow-2xl flex flex-col overflow-hidden backdrop-blur-md animate-in slide-in-from-right-8 duration-200"
            style={{ backgroundColor: `${palette.cockpitBg}f2`, borderColor: palette.cockpitBorder }}
          >
            {/* Header */}
            <div className="h-10 border-b flex items-center justify-between px-3 shrink-0" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.cockpitHeaderBg }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusTheme[cockpitAgent.status].color }} />
                {isRenaming ? (
                  <form onSubmit={(e) => { e.preventDefault(); commitRename(cockpitAgent.id) }} className="flex items-center gap-1">
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(cockpitAgent.id)}
                      className="font-mono text-xs font-semibold bg-transparent border-b outline-none w-28"
                      style={{ borderColor: palette.accent, color: palette.textMain }}
                    />
                    <button type="submit" className="p-0.5 rounded hover:opacity-80" style={{ color: palette.green }}>
                      <Check size={12} />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="font-mono text-xs font-semibold" style={{ color: palette.textMain }}>{cockpitAgent.name}</span>
                    <button
                      onClick={() => startRename(cockpitAgent.name)}
                      className="p-0.5 rounded hover:opacity-80 transition-opacity"
                      style={{ color: palette.textMuted }}
                      title="Rename"
                    >
                      <Pencil size={11} />
                    </button>
                  </>
                )}
                <span className="text-[10px] font-mono ml-1 border px-1 rounded" style={{ color: palette.textMuted, borderColor: palette.cockpitBorder }}>COCKPIT</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onAgentClick(cockpitAgent.id)
                    setCockpitAgentId(null)
                  }}
                  className="p-1 rounded transition-colors hover:opacity-80"
                  style={{ color: palette.textMuted }}
                  title="Open Full View"
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  onClick={() => { setCockpitAgentId(null); setIsRenaming(false) }}
                  className="p-1 rounded hover:bg-red-900/50 transition-colors"
                  style={{ color: palette.textMuted }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {/* Terminal Area (PtyTerminalView includes its own Composer) */}
            <div className="flex-1 min-h-0 bg-black relative p-2">
              {usePtyMode ? (
                <PtyTerminalView agentId={cockpitAgent.id} compact />
              ) : (
                <>
                  <TerminalView agentId={cockpitAgent.id} compact />
                  <div className="shrink-0 border-t p-2" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.bg }}>
                    <Composer agentId={cockpitAgent.id} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Field Size Adjust Handle */}
      <div 
        className="w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize py-1"
        onPointerDown={(e) => {
          e.preventDefault()
          const startY = e.clientY
          const startHeight = mapHeight
          
          const onMove = (me: PointerEvent) => {
            const delta = me.clientY - startY
            // Limit bounds between 300px and 1200px
            setMapHeight(Math.max(300, Math.min(startHeight + delta, 1200)))
          }
          const onUp = () => {
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
    </div>
  )
}
