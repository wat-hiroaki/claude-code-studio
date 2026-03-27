import { useState } from 'react'
import { getInitials } from '@lib/status'
import type { Agent, AgentStatus, ClaudeTaskSession } from '@shared/types'
import type { CyberPalette, CyberStyle } from './types'

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

export function AgentNode({ agent, x, y, onClick, palette, statusTheme, workspaceName, memoryMB }: AgentNodeProps) {
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
      {isActive && (
        <circle cx={x} cy={y} r={ringRadius} fill="none" stroke={theme.color} strokeWidth={0.6} strokeDasharray="3 5" opacity={0.5}>
          <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="8s" repeatCount="indefinite" />
        </circle>
      )}

      {isDanger && (
        <circle cx={x} cy={y} r={coreRadius} fill="none" stroke={theme.color} strokeWidth={1.5}>
          <animate attributeName="r" values={`${coreRadius}; ${coreRadius + 14}`} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1; 0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}

      <circle
        cx={x}
        cy={y}
        r={coreRadius}
        fill={palette.bg}
        stroke={theme.color}
        strokeWidth={1.8}
        filter={isDanger ? 'url(#cyber-glow)' : ''}
      />
      <circle cx={x} cy={y} r={4} fill={theme.color} opacity={0.8} className={isActive ? 'animate-pulse' : ''} />

      <text x={x} y={y - 28} textAnchor="middle" className="font-mono text-[11px] tracking-widest font-bold" fill={theme.color} style={{ userSelect: 'none' }}>
        {getInitials(agent.name)}
      </text>

      <text x={x} y={y + 30} textAnchor="middle" className="font-mono text-[11px] uppercase tracking-wider font-semibold" fill={palette.textMain} style={{ userSelect: 'none' }}>
        {agent.name.length > 12 ? agent.name.slice(0, 11) + '..' : agent.name}
      </text>

      <text x={x} y={y + 44} textAnchor="middle" className="font-mono text-[8.5px] uppercase tracking-wider" fill={palette.textMuted} style={{ userSelect: 'none', opacity: 0.85 }}>
        {agent.projectName.length > 16 ? agent.projectName.slice(0, 15) + '..' : agent.projectName}
      </text>

      <rect x={x - 28} y={y + 49} width={56} height={14} fill={theme.color} opacity={0.2} rx={3} />
      <text x={x} y={y + 59} textAnchor="middle" className="font-mono text-[8px] font-bold uppercase tracking-widest" fill={theme.color} style={{ userSelect: 'none' }}>
        {theme.label}
      </text>

      {memoryMB > 0 && (
        <text x={x} y={y + 72} textAnchor="middle" className="font-mono text-[7.5px] font-medium" fill={memoryMB > 2048 ? palette.red : memoryMB > 1024 ? palette.orange : palette.textMuted} style={{ userSelect: 'none' }}>
          MEM: {memoryMB >= 1024 ? `${(memoryMB / 1024).toFixed(1)}GB` : `${memoryMB}MB`}
        </text>
      )}

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
// EXTERNAL CLI SESSION NODE
// ---------------------------------------------------------
interface ExternalCliNodeProps {
  session: ClaudeTaskSession
  x: number
  y: number
  palette: CyberPalette
}

export function ExternalCliNode({ session, x, y, palette }: ExternalCliNodeProps) {
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
      <circle
        cx={x} cy={y} r={nodeRadius + 4}
        fill="none" stroke={nodeColor} strokeWidth={0.8}
        strokeDasharray="3 3" opacity={0.5}
      />

      <circle
        cx={x} cy={y} r={nodeRadius}
        fill={palette.bg} stroke={nodeColor} strokeWidth={1.2}
      />

      <circle
        cx={x} cy={y} r={3}
        fill={nodeColor} opacity={0.7}
        className={isActive ? 'animate-pulse' : ''}
      />

      <text
        x={x} y={y + 20} textAnchor="middle"
        className="font-mono text-[7px] uppercase tracking-wider"
        fill={nodeColor} style={{ userSelect: 'none' }}
      >
        CLI:{session.sessionId.slice(0, 6)}
      </text>

      <text
        x={x} y={y + 30} textAnchor="middle"
        className="font-mono text-[6px] uppercase tracking-widest"
        fill={isActive ? palette.green : palette.gray}
        style={{ userSelect: 'none' }}
      >
        {isActive ? 'ACTIVE' : 'STALE'}
      </text>

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
// CONNECTION LINES (DATA STREAMS)
// ---------------------------------------------------------
export function DataStreams({ agents, positions, palette, statusTheme }: { agents: Agent[]; positions: Map<string, { x: number; y: number }>; palette: CyberPalette; statusTheme: Record<AgentStatus, CyberStyle> }) {
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
            <line
              x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y}
              stroke={line.theme.color} strokeWidth={1} opacity={0.3}
            />
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
// CENTRAL SYSTEM HUB
// ---------------------------------------------------------
export function SystemCore({ cx, cy, stats, palette }: { cx: number; cy: number; stats: { total: number; active: number; error: number; staleCli: number }; palette: CyberPalette }) {
  const isDanger = stats.error > 0
  const coreColor = isDanger ? palette.red : palette.accent

  return (
    <g>
      <polygon
        points={`${cx},${cy-45} ${cx+39},${cy-22.5} ${cx+39},${cy+22.5} ${cx},${cy+45} ${cx-39},${cy+22.5} ${cx-39},${cy-22.5}`}
        fill={palette.bg}
        stroke={coreColor}
        strokeWidth={1}
        opacity={0.8}
      />

      <circle cx={cx} cy={cy} r={60} fill="none" stroke={coreColor} strokeWidth={0.5} strokeDasharray="10 30" opacity={0.3}>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="40s" repeatCount="indefinite" />
      </circle>

      <text x={cx} y={cy - 10} textAnchor="middle" className="font-mono font-bold tracking-[0.2em] text-[14px]" fill={palette.textMain} style={{ userSelect: 'none' }}>
        SYSTEM
      </text>

      <text x={cx} y={cy + 12} textAnchor="middle" className="font-mono text-[11px] uppercase font-bold tracking-widest" fill={isDanger ? palette.red : palette.green} style={{ userSelect: 'none' }}>
        {isDanger ? 'ERR' : 'OK'}
      </text>

      <text x={cx} y={cy + 28} textAnchor="middle" className="font-mono text-[9px] font-medium" fill={palette.textMuted} style={{ userSelect: 'none' }}>
        NODES: {stats.active}/{stats.total}
      </text>

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
import type { Team } from '@shared/types'

type CyberSectorLabelProps = {
  team: Team | null
  startAngle: number
  endAngle: number
  cx: number
  cy: number
  radius: number
}

export function CyberSectorLabel({ team, startAngle, endAngle, cx, cy, radius, palette }: CyberSectorLabelProps & { palette: CyberPalette }) {
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
