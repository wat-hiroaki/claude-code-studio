import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { getInitials } from '../lib/status'
import { PtyTerminalView } from './PtyTerminalView'
import { TerminalView } from './TerminalView'
import { Composer } from './Composer'
import { X, GripHorizontal, Maximize2, Pencil, Check, ChevronDown, ChevronUp, RotateCw, Square, Cpu, Clock, Wrench, Zap, Plus, Minus, Maximize } from 'lucide-react'
import type { Agent, AgentStatus, Team, Workspace, AgentProfileData, ClaudeTaskSession } from '@shared/types'

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

// ---------------------------------------------------------
// 2-LAYER GROUPING: Machine → Project → Agents
// ---------------------------------------------------------
interface ProjectGroup2 {
  projectName: string
  agents: Agent[]
}

interface MachineGroup2 {
  machineKey: string
  machineName: string
  isSSH: boolean
  sshHost?: string
  projects: ProjectGroup2[]
}

function groupByMachineAndProject(agents: Agent[], workspaces: Workspace[], workspaceNameMap: Map<string, string>): MachineGroup2[] {
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
  const ringRadius = 18

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(agent.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
function SystemCore({ cx, cy, stats, palette }: { cx: number; cy: number; stats: { total: number; active: number; error: number; staleCli: number }; palette: CyberPalette }) {
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

      {/* Stale CLI session count */}
      {stats.staleCli > 0 && (
        <text x={cx} y={cy + 40} textAnchor="middle" className="font-mono text-[7.5px]" fill={palette.gray} style={{ userSelect: 'none' }}>
          CLI: {stats.staleCli} stale
        </text>
      )}
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
// EXTERNAL CLI SESSION NODE
// ---------------------------------------------------------
interface ExternalCliNodeProps {
  session: ClaudeTaskSession
  x: number
  y: number
  palette: CyberPalette
}

function ExternalCliNode({ session, x, y, palette }: ExternalCliNodeProps) {
  const [hovered, setHovered] = useState(false)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  const isActive = new Date(session.lastModified).getTime() > fiveMinAgo
  const nodeColor = palette.purple
  const nodeRadius = 8

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Dashed outline ring */}
      <circle
        cx={x} cy={y} r={nodeRadius + 4}
        fill="none" stroke={nodeColor} strokeWidth={0.8}
        strokeDasharray="3 3" opacity={0.5}
      />

      {/* Core circle */}
      <circle
        cx={x} cy={y} r={nodeRadius}
        fill={palette.bg} stroke={nodeColor} strokeWidth={1.2}
      />

      {/* Inner dot — pulse if active */}
      <circle
        cx={x} cy={y} r={3}
        fill={nodeColor} opacity={0.7}
        className={isActive ? 'animate-pulse' : ''}
      />

      {/* Label */}
      <text
        x={x} y={y + 20} textAnchor="middle"
        className="font-mono text-[7px] uppercase tracking-wider"
        fill={nodeColor} style={{ userSelect: 'none' }}
      >
        CLI:{session.sessionId.slice(0, 6)}
      </text>

      {/* Status badge */}
      <text
        x={x} y={y + 30} textAnchor="middle"
        className="font-mono text-[6px] uppercase tracking-widest"
        fill={isActive ? palette.green : palette.gray}
        style={{ userSelect: 'none' }}
      >
        {isActive ? 'ACTIVE' : 'STALE'}
      </text>

      {/* Hover tooltip */}
      {hovered && (
        <foreignObject x={x + 16} y={y - 30} width={170} height={70} style={{ overflow: 'visible', zIndex: 100 }}>
          <div
            className="border shadow-lg rounded"
            style={{
              backgroundColor: palette.panelBg,
              borderColor: palette.panelBorder,
              backdropFilter: 'blur(8px)',
              padding: '6px 8px',
              fontFamily: 'monospace',
              fontSize: '9px',
              color: palette.textMain
            }}
          >
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>External CLI Session</div>
            <div className="flex justify-between mb-0.5">
              <span style={{ color: palette.textMuted }}>ID</span>
              <span>{session.sessionId.slice(0, 12)}</span>
            </div>
            <div className="flex justify-between mb-0.5">
              <span style={{ color: palette.textMuted }}>HWM</span>
              <span>{session.highwatermark}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: palette.textMuted }}>STATUS</span>
              <span style={{ color: isActive ? palette.green : palette.gray }}>{isActive ? 'ACTIVE' : 'STALE'}</span>
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  )
}

// ---------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------
export function ActivityMap({ teams, onAgentClick }: ActivityMapProps) {
  const { t } = useTranslation()
  const { agents, usePtyMode, updateAgentInList, agentMemory, activeChainFlows, agentTeamsData } = useAppStore()
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

  // Cockpit terminal collapse state
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

  // Zoom controls
  const handleZoomIn = useCallback(() => setScale(s => Math.min(4, s + 0.2)), [])
  const handleZoomOut = useCallback(() => setScale(s => Math.max(0.4, s - 0.2)), [])
  const handleZoomFit = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [])

  // 2-layer grouping: Machine → Project → Agents
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

    // Count total agent slots across all machines for even arc distribution
    let globalIndex = 0

    for (const machine of machineGroups) {
      const machineAgentCount = machine.projects.reduce((sum, p) => sum + p.agents.length, 0)
      // Machine label at the midpoint of its arc
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
          // Spread agents along tangent at this project's arc segment
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

        // Project label
        const projMidIndex = globalIndex + (agentCount - 1) / 2
        const projMidAngle = (2 * Math.PI * projMidIndex) / totalAgents - Math.PI / 2
        const projLabelRadius = mainRadius + 55
        pLabels.push({
          name: project.projectName,
          x: centerX + projLabelRadius * Math.cos(projMidAngle),
          y: centerY + projLabelRadius * Math.sin(projMidAngle)
        })

        // Build sector for this project group
        const startAngle = (2 * Math.PI * projectStartIndex) / totalAgents - Math.PI / 2
        const endAngle = (2 * Math.PI * (projectStartIndex + agentCount)) / totalAgents - Math.PI / 2
        const teamForGroup = teams.find(t => project.agents.some(a => a.teamId === t.id))
        sectors.push({ team: teamForGroup ?? null, startAngle, endAngle })

        globalIndex += agentCount
      }
    }
    return { positions: pos, teamSectors: sectors, machineLabels: mLabels, projectLabels: pLabels }
  }, [activeAgents, teams, centerX, centerY, machineGroups])

  // External CLI sessions (unmatched to any agent) — split active vs stale
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

  if (activeAgents.length === 0 && activeExternalSessions.length === 0) {
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

            {/* Machine labels (outer ring) */}
            {machineLabels.map((ml, i) => (
              <g key={`machine-${i}`}>
                <rect x={ml.x - 44} y={ml.y - 8} width={88} height={16} fill={palette.bg} stroke={ml.isSSH ? palette.orange : palette.accent} strokeWidth={0.6} rx={3} opacity={0.9} />
                <text x={ml.x} y={ml.y + 3} textAnchor="middle" className="font-mono text-[8px] uppercase tracking-wider font-semibold" fill={ml.isSSH ? palette.orange : palette.textMuted} style={{ userSelect: 'none' }}>
                  {ml.isSSH ? '🖥 ' : '💻 '}{ml.name.length > 10 ? ml.name.slice(0, 9) + '..' : ml.name}
                </text>
              </g>
            ))}

            {/* Project labels (inner ring) */}
            {projectLabels.map((pl, i) => (
              <g key={`project-${i}`}>
                <rect x={pl.x - 38} y={pl.y - 7} width={76} height={14} fill={palette.bg} stroke={palette.accent} strokeWidth={0.4} rx={3} opacity={0.85} />
                <text x={pl.x} y={pl.y + 3} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-wider" fill={palette.accent} style={{ userSelect: 'none' }}>
                  {pl.name.length > 12 ? pl.name.slice(0, 11) + '..' : pl.name}
                </text>
              </g>
            ))}

            <DataStreams agents={activeAgents} positions={positions} palette={palette} statusTheme={statusTheme} />

            {/* Chain Flow Animations */}
            {activeChainFlows.map((flow) => {
              const from = positions.get(flow.fromAgentId)
              const to = positions.get(flow.toAgentId)
              if (!from || !to) return null
              const progress = Math.min((Date.now() - flow.firedAt) / 4000, 1)
              const opacity = progress < 0.8 ? 1 : (1 - progress) * 5
              return (
                <g key={flow.id} opacity={opacity}>
                  {/* Glowing path */}
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={palette.cyan} strokeWidth={2.5} opacity={0.6} filter="url(#cyber-glow)" />
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={palette.cyan} strokeWidth={1} strokeDasharray="8 4" opacity={0.9}>
                    <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.6s" repeatCount="indefinite" />
                  </line>
                  {/* Traveling pulse */}
                  <circle r={4} fill={palette.cyan} filter="url(#cyber-glow)">
                    <animateMotion dur="0.8s" repeatCount="indefinite" path={`M${from.x},${from.y} L${to.x},${to.y}`} />
                  </circle>
                  {/* Chain name label at midpoint */}
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 8}
                    textAnchor="middle"
                    className="font-mono text-[7px] font-bold uppercase"
                    fill={palette.cyan}
                    style={{ userSelect: 'none' }}
                  >
                    CHAIN: {flow.chainName.slice(0, 15)}
                  </text>
                </g>
              )
            })}

            <SystemCore cx={centerX} cy={centerY} stats={stats} palette={palette} />

            {activeAgents.map((agent) => {
              const pos = positions.get(agent.id)
              if (!pos) return null
              return (
                <g key={agent.id}>
                  {/* Pulse indicator for hwm changes */}
                  {pulsingAgents.has(agent.id) && (
                    <circle cx={pos.x} cy={pos.y} r={12} fill="none" stroke={palette.cyan} strokeWidth={2} opacity={0.8}>
                      <animate attributeName="r" values="12;28" dur="1s" repeatCount="3" />
                      <animate attributeName="opacity" values="0.8;0" dur="1s" repeatCount="3" />
                    </circle>
                  )}
                  <AgentNode agent={agent} x={pos.x} y={pos.y} onClick={handleAgentNodeClick} palette={palette} statusTheme={statusTheme} workspaceName={resolveWorkspaceName(agent)} memoryMB={agentMemory.get(agent.id) || 0} />
                </g>
              )
            })}

            {/* External CLI Sessions (only ACTIVE on outer ring) */}
            {activeExternalSessions.map((session) => {
              const pos = externalPositions.get(session.sessionId)
              if (!pos) return null
              return <ExternalCliNode key={`cli-${session.sessionId}`} session={session} x={pos.x} y={pos.y} palette={palette} />
            })}
          </g>
          
          {/* Footer info fixed to canvas bottom */}
          <text x={centerX} y={svgHeight - 15} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-[0.4em]" fill={palette.accent} opacity={0.5} style={{ userSelect: 'none' }}>
            CLAUDE-AGENTDECK :: TACTICAL OVERVIEW
          </text>
        </svg>

        {/* Zoom controls */}
        <div
          className="absolute bottom-2 right-2 flex flex-col gap-1 pointer-events-auto"
          style={{ zIndex: 20 }}
        >
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded transition-colors hover:opacity-80"
            style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
            title={t('activityMap.zoomIn')}
          >
            <Plus size={14} />
          </button>
          <div
            className="text-center text-[9px] font-mono py-0.5 rounded"
            style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted, minWidth: '30px' }}
          >
            {Math.round(scale * 100)}%
          </div>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded transition-colors hover:opacity-80"
            style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
            title={t('activityMap.zoomOut')}
          >
            <Minus size={14} />
          </button>
          <div className="h-px" />
          <button
            onClick={handleZoomFit}
            className="p-1.5 rounded transition-colors hover:opacity-80"
            style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
            title={t('activityMap.zoomFit')}
          >
            <Maximize size={14} />
          </button>
        </div>

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
            {/* Status Panel */}
            <div className="shrink-0 border-b px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1" style={{ borderColor: palette.cockpitBorder, backgroundColor: palette.cockpitHeaderBg }}>
              <div className="flex items-center gap-1.5">
                <Cpu size={10} style={{ color: palette.textMuted }} />
                <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>MEM</span>
                <span className="font-mono text-[10px] font-medium" style={{ color: (agentMemory.get(cockpitAgent.id) || 0) > 2048 ? palette.red : (agentMemory.get(cockpitAgent.id) || 0) > 1024 ? palette.orange : palette.textMain }}>
                  {(() => { const mb = agentMemory.get(cockpitAgent.id) || 0; return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB` })()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={10} style={{ color: palette.textMuted }} />
                <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>STATUS</span>
                <span className="font-mono text-[10px] font-medium" style={{ color: statusTheme[cockpitAgent.status].color }}>
                  {statusTheme[cockpitAgent.status].label}
                </span>
              </div>
              {cockpitAgent.currentTask && (
                <div className="col-span-2 flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-[10px]" style={{ color: palette.textMuted }}>TASK</span>
                  <span className="font-mono text-[10px] truncate" style={{ color: palette.textMain }}>
                    {cockpitAgent.currentTask.slice(0, 40)}
                  </span>
                </div>
              )}
            </div>

            {/* Agent Capabilities */}
            {cockpitProfile && (cockpitProfile.mcpServers.length > 0 || cockpitProfile.skills.length > 0) && (
              <div className="shrink-0 border-b px-3 py-1.5" style={{ borderColor: palette.cockpitBorder }}>
                <div className="flex items-center gap-3 flex-wrap">
                  {cockpitProfile.mcpServers.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Wrench size={9} style={{ color: palette.textMuted }} />
                      <span className="font-mono text-[9px]" style={{ color: palette.textMuted }}>MCP</span>
                      <span className="font-mono text-[9px] font-medium" style={{ color: palette.cyan }}>
                        {cockpitProfile.mcpServers.filter(s => s.enabled).length}
                      </span>
                    </div>
                  )}
                  {cockpitProfile.skills.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Zap size={9} style={{ color: palette.textMuted }} />
                      <span className="font-mono text-[9px]" style={{ color: palette.textMuted }}>SKILLS</span>
                      <span className="font-mono text-[9px] font-medium" style={{ color: palette.green }}>
                        {cockpitProfile.skills.length}
                      </span>
                    </div>
                  )}
                </div>
                {cockpitAgent && cockpitAgent.skills.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {cockpitAgent.skills.slice(0, 6).map(skill => (
                      <span key={skill} className="px-1 py-px rounded text-[8px] font-mono" style={{ backgroundColor: `${palette.cyan}15`, color: palette.cyan }}>
                        {skill}
                      </span>
                    ))}
                    {cockpitAgent.skills.length > 6 && (
                      <span className="text-[8px] font-mono" style={{ color: palette.textMuted }}>+{cockpitAgent.skills.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b" style={{ borderColor: palette.cockpitBorder }}>
              <button
                onClick={async () => {
                  await window.api.restartAgent(cockpitAgent.id)
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
                style={{ color: palette.cyan, backgroundColor: `${palette.cyan}15` }}
                title="Restart"
              >
                <RotateCw size={10} /> RESTART
              </button>
              <button
                onClick={async () => {
                  await window.api.archiveAgent(cockpitAgent.id)
                  setCockpitAgentId(null)
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
                style={{ color: palette.red, backgroundColor: `${palette.red}15` }}
                title="Stop"
              >
                <Square size={10} /> STOP
              </button>
              <div className="ml-auto">
                <button
                  onClick={() => setTerminalCollapsed(v => !v)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-opacity"
                  style={{ color: palette.textMuted }}
                >
                  {terminalCollapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                  {terminalCollapsed ? 'EXPAND' : 'COLLAPSE'}
                </button>
              </div>
            </div>

            {/* Terminal Area (collapsible) */}
            <div className={`flex-1 min-h-0 bg-black relative p-2 ${terminalCollapsed ? 'hidden' : ''}`}>
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
