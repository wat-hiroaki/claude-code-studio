import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { getInitials } from '../lib/status'
import { PtyTerminalView } from './PtyTerminalView'
import { TerminalView } from './TerminalView'
import { Composer } from './Composer'
import { X, GripHorizontal, Maximize2 } from 'lucide-react'
import type { Agent, AgentStatus, Team } from '@shared/types'

interface ActivityMapProps {
  teams: Team[]
  onAgentClick: (id: string) => void
}

// ---------------------------------------------------------
// CYBER/HUD THEME DEFINITIONS
// ---------------------------------------------------------
const cyberPalette = {
  bg: '#09090b', // Deep zinc-950 for refined dark theme
  accent: '#71717a', // Zinc-500
  cyan: '#0ea5e9', // Sky blue for subtle tech feel
  green: '#10b981', // Emerald
  orange: '#f59e0b', // Amber
  red: '#ef4444', // Red
  purple: '#8b5cf6', // Violet
  gray: '#52525b', // Zinc 600
  darkGray: '#18181b', // Zinc 900
  grid: '#18181b', // Very subtle grid
  textMain: '#fafafa',
  textMuted: '#a1a1aa'
}

type CyberStyle = { color: string; glow: string; label: string }

const statusTheme: Record<AgentStatus, CyberStyle> = {
  creating: { color: cyberPalette.gray, glow: 'rgba(82,82,91,0.4)', label: 'INIT' },
  active: { color: cyberPalette.green, glow: 'rgba(16,185,129,0.4)', label: 'ACTIVE' },
  thinking: { color: cyberPalette.cyan, glow: 'rgba(14,165,233,0.4)', label: 'COMPUTING' },
  tool_running: { color: cyberPalette.orange, glow: 'rgba(245,158,11,0.4)', label: 'EXEC' },
  awaiting: { color: cyberPalette.accent, glow: 'rgba(113,113,122,0.4)', label: 'AWAIT' },
  error: { color: cyberPalette.red, glow: 'rgba(239,68,68,0.5)', label: 'ERR: CRITICAL' },
  session_conflict: { color: cyberPalette.purple, glow: 'rgba(139,92,246,0.4)', label: 'CONFLICT' },
  idle: { color: cyberPalette.gray, glow: 'transparent', label: 'STANDBY' },
  archived: { color: cyberPalette.darkGray, glow: 'transparent', label: 'OFFLINE' }
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
function AgentNode({ agent, x, y, onClick }: { agent: Agent; x: number; y: number; onClick: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const theme = statusTheme[agent.status]
  const isActive = ['active', 'thinking', 'tool_running', 'awaiting'].includes(agent.status)
  const isDanger = agent.status === 'error'
  
  const coreRadius = 8
  const workspaceName = agent.workspaceId ? agent.workspaceId.split('/').pop()?.split('\\').pop() : 'Default'
  
  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(agent.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ターゲットロックオンのクロスヘア (洗練版) */}
      <path
        d={`M ${x - 18} ${y - 18} L ${x - 12} ${y - 18} M ${x - 18} ${y - 18} L ${x - 18} ${y - 12}
            M ${x + 18} ${y - 18} L ${x + 12} ${y - 18} M ${x + 18} ${y - 18} L ${x + 18} ${y - 12}
            M ${x - 18} ${y + 18} L ${x - 12} ${y + 18} M ${x - 18} ${y + 18} L ${x - 18} ${y + 12}
            M ${x + 18} ${y + 18} L ${x + 12} ${y + 18} M ${x + 18} ${y + 18} L ${x + 18} ${y + 12}`}
        stroke={hovered ? cyberPalette.textMain : theme.color}
        strokeWidth={1}
        fill="none"
        opacity={hovered ? 0.8 : 0.3}
      />

      {/* 外側の回転リング (アクティブ時のみ、控えめに) */}
      {isActive && (
        <g>
          <circle cx={x} cy={y} r={14} fill="none" stroke={theme.color} strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* エラー時の警告リップル */}
      {isDanger && (
        <circle cx={x} cy={y} r={12} fill="none" stroke={theme.color} strokeWidth={1.5}>
          <animate attributeName="r" values="8; 20" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1; 0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      {/* コアサークル */}
      <circle
        cx={x}
        cy={y}
        r={coreRadius}
        fill={cyberPalette.bg}
        stroke={theme.color}
        strokeWidth={1.5}
        filter={isDanger ? 'url(#cyber-glow)' : ''}
      />
      {/* 内部コア */}
      <circle cx={x} cy={y} r={3} fill={theme.color} opacity={0.8} className={isActive ? 'animate-pulse' : ''} />

      {/* テキスト - Initials */}
      <text x={x} y={y - 20} textAnchor="middle" className="font-mono text-[9px] tracking-widest" fill={theme.color} opacity={0.8} style={{ userSelect: 'none' }}>
        {getInitials(agent.name)}
      </text>

      {/* エージェント名 */}
      <text x={x} y={y + 26} textAnchor="middle" className="font-mono text-[8.5px] uppercase tracking-wider font-medium" fill={cyberPalette.textMain} style={{ userSelect: 'none' }}>
        {agent.name.length > 12 ? agent.name.slice(0, 11) + '..' : agent.name}
      </text>

      {/* ワークスペース名追加 */}
      <text x={x} y={y + 36} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-wider" fill={cyberPalette.textMuted} style={{ userSelect: 'none' }}>
        WKSP: {workspaceName?.slice(0, 10)}
      </text>

      {/* ステータスドット/バッジ (シンプル版) */}
      <rect x={x - 20} y={y + 40} width={40} height={10} fill={theme.color} opacity={0.1} />
      <text x={x} y={y + 48} textAnchor="middle" className="font-mono text-[6.5px] font-bold uppercase tracking-widest" fill={theme.color} style={{ userSelect: 'none', opacity: 0.9 }}>
        {theme.label}
      </text>

      {/* Hover Info Panel (Sleek Tooltip) */}
      {hovered && (
        <foreignObject x={x + 25} y={y - 40} width={180} height={110} style={{ overflow: 'visible', zIndex: 100 }}>
          <div
            className="border shadow-xl relative"
            style={{
              backgroundColor: 'rgba(9, 9, 11, 0.9)', // zinc-950 with opacity
              borderColor: 'rgba(82, 82, 91, 0.5)', // zinc-600
              backdropFilter: 'blur(8px)',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '10px',
              color: cyberPalette.textMain
            }}
          >
            {/* Corner tech accent */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l" style={{ borderColor: theme.color }} />
            
            <div style={{ color: cyberPalette.textMain, fontWeight: 'bold', fontSize: '11px', borderBottom: `1px solid rgba(82,82,91,0.5)`, paddingBottom: '4px', marginBottom: '6px' }}>
              {agent.name}
            </div>
            
            <div className="flex justify-between mb-1 opacity-90">
              <span style={{ color: cyberPalette.textMuted }}>STATUS</span>
              <span style={{ color: theme.color }}>{agent.status}</span>
            </div>
            {agent.workspaceId && (
              <div className="flex justify-between mb-1 opacity-90">
                <span style={{ color: cyberPalette.textMuted }}>WORKSP</span>
                <span className="truncate ml-2 text-right">{workspaceName}</span>
              </div>
            )}
            {agent.currentTask && (
              <div className="mt-2 text-[9px] leading-tight" style={{ color: cyberPalette.textMuted }}>
                <div className="mb-[2px] opacity-70">CURRENT TASK:</div>
                <div className="break-all">{agent.currentTask.slice(0, 50)}{agent.currentTask.length > 50 ? '...' : ''}</div>
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
function DataStreams({ agents, positions }: { agents: Agent[]; positions: Map<string, { x: number; y: number }> }) {
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
        const isActive = line.theme.color === cyberPalette.cyan || line.theme.color === cyberPalette.green || line.theme.color === cyberPalette.orange
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
function SystemCore({ cx, cy, stats }: { cx: number; cy: number; stats: { total: number; active: number; error: number } }) {
  const isDanger = stats.error > 0
  const coreColor = isDanger ? cyberPalette.red : cyberPalette.accent
  
  return (
    <g>
      {/* Sleek Minimal Core Hexagon */}
      <polygon
        points={`${cx},${cy-45} ${cx+39},${cy-22.5} ${cx+39},${cy+22.5} ${cx},${cy+45} ${cx-39},${cy+22.5} ${cx-39},${cy-22.5}`}
        fill={cyberPalette.bg}
        stroke={coreColor}
        strokeWidth={1}
        opacity={0.8}
      />

      {/* Thin rotating ring */}
      <circle cx={cx} cy={cy} r={60} fill="none" stroke={coreColor} strokeWidth={0.5} strokeDasharray="10 30" opacity={0.3}>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="40s" repeatCount="indefinite" />
      </circle>

      {/* Core Text Elements */}
      <text x={cx} y={cy - 10} textAnchor="middle" className="font-mono font-medium tracking-[0.15em] text-[12px]" fill={cyberPalette.textMain} style={{ userSelect: 'none' }}>
        SYSTEM
      </text>

      {/* Health / Error display */}
      <text x={cx} y={cy + 10} textAnchor="middle" className="font-mono text-[9px] uppercase font-bold tracking-widest" fill={isDanger ? cyberPalette.red : cyberPalette.green} style={{ userSelect: 'none' }}>
        {isDanger ? 'ERR' : 'OK'}
      </text>

      {/* Online Stats */}
      <text x={cx} y={cy + 25} textAnchor="middle" className="font-mono text-[7.5px]" fill={cyberPalette.textMuted} style={{ userSelect: 'none' }}>
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
function CyberSectorLabel({ team, startAngle, endAngle, cx, cy, radius }: CyberSectorLabelProps) {
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
        stroke={team?.color || cyberPalette.gray}
        strokeWidth={2}
        opacity={0.5}
        strokeDasharray="4 4"
      />
      <rect x={x - 40} y={y - 8} width={80} height={16} fill={cyberPalette.bg} stroke={team?.color || cyberPalette.gray} strokeWidth={0.5} opacity={0.9} />
      <text x={x} y={y + 3} textAnchor="middle" className="font-mono text-[8px] uppercase tracking-wider" fill={team?.color || cyberPalette.textMain} style={{ userSelect: 'none' }}>
        SEC: {team?.name || 'UNASSIGNED'}
      </text>
    </g>
  )
}

// ---------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------
export function ActivityMap({ teams, onAgentClick }: ActivityMapProps) {
  const { agents, usePtyMode } = useAppStore()
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  // Pan, Zoom and Field Size States
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mapHeight, setMapHeight] = useState(500)
  const isDraggingMap = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Cockpit view state
  const [cockpitAgentId, setCockpitAgentId] = useState<string | null>(null)

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
      <div className="w-full flex items-center justify-center aspect-video bg-[#09090b] border border-zinc-800 overflow-hidden font-mono relative rounded-md">
         <div className="text-zinc-500 text-sm tracking-widest opacity-50 flex flex-col items-center">
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
          backgroundColor: cyberPalette.bg,
          borderColor: 'rgba(82, 82, 91, 0.4)', // zinc-600
          height: `${mapHeight}px`
        }}
      >
        {/* Subtle grid gradient */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(${cyberPalette.textMain} 1px, transparent 1px), linear-gradient(90deg, ${cyberPalette.textMain} 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            backgroundPosition: `${pan.x}px ${pan.y}px` // Parallax grid
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
               <CyberSectorLabel key={i} {...s} cx={centerX} cy={centerY} radius={230} />
            ))}

            <DataStreams agents={activeAgents} positions={positions} />
            <SystemCore cx={centerX} cy={centerY} stats={stats} />

            {activeAgents.map((agent) => {
              const pos = positions.get(agent.id)
              if (!pos) return null
              return <AgentNode key={agent.id} agent={agent} x={pos.x} y={pos.y} onClick={handleAgentNodeClick} />
            })}
          </g>
          
          {/* Static Corner Decorators */}
          <g opacity={0.3}>
            <path d="M 20 50 L 20 20 L 50 20" fill="none" stroke={cyberPalette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} 50 L ${svgWidth - 20} 20 L ${svgWidth - 50} 20`} fill="none" stroke={cyberPalette.accent} strokeWidth={1} />
            <path d={`M 20 ${svgHeight - 50} L 20 ${svgHeight - 20} L 50 ${svgHeight - 20}`} fill="none" stroke={cyberPalette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} ${svgHeight - 50} L ${svgWidth - 20} ${svgHeight - 20} L ${svgWidth - 50} ${svgHeight - 20}`} fill="none" stroke={cyberPalette.accent} strokeWidth={1} />
          </g>

          {/* Footer info fixed to canvas bottom */}
          <text x={centerX} y={svgHeight - 15} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-[0.4em]" fill={cyberPalette.accent} opacity={0.5} style={{ userSelect: 'none' }}>
            CLAUDE-AGENTDECK :: TACTICAL OVERVIEW
          </text>
        </svg>

        {/* Cockpit Overlay */}
        {cockpitAgent && (
          <div className="absolute right-4 top-4 bottom-4 w-96 max-w-[50%] bg-[#09090b]/95 border border-zinc-700 rounded-lg shadow-2xl flex flex-col overflow-hidden backdrop-blur-md animate-in slide-in-from-right-8 duration-200">
            {/* Header */}
            <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusTheme[cockpitAgent.status].color }} />
                <span className="font-mono text-xs font-semibold">{cockpitAgent.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono ml-2 border border-zinc-800 px-1 rounded">COCKPIT</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onAgentClick(cockpitAgent.id)
                    setCockpitAgentId(null)
                  }}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                  title="Open Full View"
                >
                  <Maximize2 size={13} />
                </button>
                <button 
                  onClick={() => setCockpitAgentId(null)}
                  className="p-1 hover:bg-red-900/50 rounded text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {/* Terminal Area */}
            <div className="flex-1 min-h-0 bg-black relative p-2">
              {usePtyMode ? (
                <PtyTerminalView agentId={cockpitAgent.id} compact />
              ) : (
                <TerminalView agentId={cockpitAgent.id} compact />
              )}
            </div>
            {/* Composer Area */}
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-2">
              <Composer agentId={cockpitAgent.id} />
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
        <div className="h-1.5 w-16 bg-zinc-700/50 hover:bg-zinc-500 rounded-full flex items-center justify-center">
          <GripHorizontal size={10} className="text-zinc-400" />
        </div>
      </div>
    </div>
  )
}
