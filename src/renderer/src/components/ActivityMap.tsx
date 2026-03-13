import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { getInitials } from '../lib/status'
import type { Agent, AgentStatus, Team } from '@shared/types'

interface ActivityMapProps {
  teams: Team[]
  onAgentClick: (id: string) => void
}

// Status-based glow colors (SF command center palette)
const statusGlow: Record<AgentStatus, { ring: string; pulse: string; label: string }> = {
  creating: { ring: 'stroke-gray-500', pulse: '', label: 'text-gray-400' },
  active: { ring: 'stroke-emerald-400', pulse: 'animate-[glow-pulse_3s_ease-in-out_infinite]', label: 'text-emerald-400' },
  thinking: { ring: 'stroke-blue-400', pulse: 'animate-[glow-pulse_1.5s_ease-in-out_infinite]', label: 'text-blue-400' },
  tool_running: { ring: 'stroke-amber-400', pulse: 'animate-spin-slow', label: 'text-amber-400' },
  awaiting: { ring: 'stroke-orange-400', pulse: 'animate-[glow-pulse_2s_ease-in-out_infinite]', label: 'text-orange-400' },
  error: { ring: 'stroke-red-500', pulse: 'animate-[glow-pulse_0.8s_ease-in-out_infinite]', label: 'text-red-500' },
  session_conflict: { ring: 'stroke-purple-400', pulse: 'animate-[glow-pulse_1s_ease-in-out_infinite]', label: 'text-purple-400' },
  idle: { ring: 'stroke-gray-500', pulse: '', label: 'text-gray-500' },
  archived: { ring: 'stroke-gray-600', pulse: '', label: 'text-gray-600' }
}

const statusFill: Record<AgentStatus, string> = {
  creating: '#6b7280',
  active: '#34d399',
  thinking: '#60a5fa',
  tool_running: '#fbbf24',
  awaiting: '#fb923c',
  error: '#ef4444',
  session_conflict: '#c084fc',
  idle: '#6b7280',
  archived: '#4b5563'
}

// Calculate radial positions for agents around center
function getRadialPosition(
  index: number,
  total: number,
  centerX: number,
  centerY: number,
  radius: number
): { x: number; y: number } {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2 // Start from top
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle)
  }
}

// Group agents by team sector
function groupByTeam(
  agents: Agent[],
  teams: Team[]
): { team: Team | null; agents: Agent[] }[] {
  const groups: { team: Team | null; agents: Agent[] }[] = teams.map((t) => ({
    team: t,
    agents: agents.filter((a) => a.teamId === t.id)
  }))
  const unassigned = agents.filter((a) => !a.teamId)
  if (unassigned.length > 0) {
    groups.push({ team: null, agents: unassigned })
  }
  return groups.filter((g) => g.agents.length > 0)
}

interface AgentNodeProps {
  agent: Agent
  x: number
  y: number
  onClick: (id: string) => void
}

function AgentNode({ agent, x, y, onClick }: AgentNodeProps): JSX.Element {
  const { t } = useTranslation()
  const glow = statusGlow[agent.status]
  const nodeRadius = 28

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(agent.id)}
      role="button"
      tabIndex={0}
    >
      {/* Outer glow ring */}
      <circle
        cx={x}
        cy={y}
        r={nodeRadius + 6}
        fill="none"
        strokeWidth={2}
        className={cn(glow.ring, glow.pulse)}
        opacity={0.6}
      />

      {/* Scanning ring for active statuses */}
      {(agent.status === 'thinking' || agent.status === 'tool_running') && (
        <circle
          cx={x}
          cy={y}
          r={nodeRadius + 12}
          fill="none"
          strokeWidth={1}
          strokeDasharray="4 6"
          className={cn(glow.ring, 'animate-spin-slow')}
          opacity={0.3}
        />
      )}

      {/* Background circle */}
      <circle
        cx={x}
        cy={y}
        r={nodeRadius}
        fill="rgba(13, 13, 26, 0.85)"
        stroke={statusFill[agent.status]}
        strokeWidth={2}
      />

      {/* Inner status indicator */}
      <circle
        cx={x}
        cy={y}
        r={3}
        fill={statusFill[agent.status]}
        className={agent.status === 'thinking' ? 'animate-pulse' : ''}
      >
        <animate
          attributeName="r"
          values={agent.status === 'error' ? '2;4;2' : '3;3;3'}
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Initials */}
      <text
        x={x}
        y={y - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-gray-200 text-[11px] font-mono font-bold"
        style={{ userSelect: 'none' }}
      >
        {getInitials(agent.name)}
      </text>

      {/* Agent name */}
      <text
        x={x}
        y={y + 12}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-gray-400 text-[8px] font-mono"
        style={{ userSelect: 'none' }}
      >
        {agent.name.length > 10 ? agent.name.slice(0, 9) + '..' : agent.name}
      </text>

      {/* Status label below */}
      <text
        x={x}
        y={y + nodeRadius + 14}
        textAnchor="middle"
        dominantBaseline="middle"
        className={cn('text-[7px] font-mono uppercase tracking-wider', glow.label)}
        style={{ userSelect: 'none' }}
      >
        {t(`status.${agent.status}`)}
      </text>

      {/* Current task (truncated) */}
      {agent.currentTask && (
        <text
          x={x}
          y={y + nodeRadius + 24}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-500 text-[6px] font-mono"
          style={{ userSelect: 'none' }}
        >
          {agent.currentTask.length > 20
            ? agent.currentTask.slice(0, 19) + '...'
            : agent.currentTask}
        </text>
      )}
    </g>
  )
}

// Connection lines between agents (reportTo relationships)
function ConnectionLines({
  agents,
  positions
}: {
  agents: Agent[]
  positions: Map<string, { x: number; y: number }>
}): JSX.Element {
  const lines: { from: { x: number; y: number }; to: { x: number; y: number }; status: AgentStatus }[] = []

  for (const agent of agents) {
    if (!agent.reportTo) continue
    const fromPos = positions.get(agent.id)
    const toPos = positions.get(agent.reportTo)
    if (fromPos && toPos) {
      lines.push({ from: fromPos, to: toPos, status: agent.status })
    }
  }

  return (
    <g>
      {/* Glow filter */}
      <defs>
        <filter id="line-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.from.x}
          y1={line.from.y}
          x2={line.to.x}
          y2={line.to.y}
          stroke={statusFill[line.status]}
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.35}
          filter="url(#line-glow)"
        />
      ))}
    </g>
  )
}

// Central system status hub
function CentralHub({
  centerX,
  centerY,
  stats
}: {
  centerX: number
  centerY: number
  stats: { total: number; active: number; error: number }
}): JSX.Element {
  const { t } = useTranslation()
  const hubRadius = 40
  const healthPercent = stats.total > 0 ? Math.round(((stats.total - stats.error) / stats.total) * 100) : 0

  return (
    <g>
      {/* Outer rotating ring */}
      <circle
        cx={centerX}
        cy={centerY}
        r={hubRadius + 8}
        fill="none"
        stroke="rgba(99, 102, 241, 0.15)"
        strokeWidth={1}
        strokeDasharray="8 4"
        className="animate-spin-slow"
      />

      {/* Hub background */}
      <circle
        cx={centerX}
        cy={centerY}
        r={hubRadius}
        fill="rgba(13, 13, 26, 0.9)"
        stroke="rgba(99, 102, 241, 0.4)"
        strokeWidth={1.5}
      />

      {/* Health arc */}
      <circle
        cx={centerX}
        cy={centerY}
        r={hubRadius - 4}
        fill="none"
        stroke={stats.error > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(52, 211, 153, 0.5)'}
        strokeWidth={2}
        strokeDasharray={`${(hubRadius - 4) * 2 * Math.PI * (healthPercent / 100)} ${(hubRadius - 4) * 2 * Math.PI}`}
        transform={`rotate(-90 ${centerX} ${centerY})`}
      />

      {/* System label */}
      <text
        x={centerX}
        y={centerY - 12}
        textAnchor="middle"
        className="fill-indigo-300 text-[7px] font-mono uppercase tracking-[0.2em]"
        style={{ userSelect: 'none' }}
      >
        {t('activityMap.system', 'SYSTEM')}
      </text>

      {/* Health percentage */}
      <text
        x={centerX}
        y={centerY + 4}
        textAnchor="middle"
        className={cn(
          'text-[16px] font-mono font-bold',
          stats.error > 0 ? 'fill-red-400' : 'fill-emerald-400'
        )}
        style={{ userSelect: 'none' }}
      >
        {healthPercent}%
      </text>

      {/* Active count */}
      <text
        x={centerX}
        y={centerY + 18}
        textAnchor="middle"
        className="fill-gray-500 text-[7px] font-mono"
        style={{ userSelect: 'none' }}
      >
        {stats.active}/{stats.total} {t('activityMap.online', 'ONLINE')}
      </text>
    </g>
  )
}

// Team sector arc label
function TeamSectorLabel({
  team,
  startAngle,
  endAngle,
  centerX,
  centerY,
  radius
}: {
  team: Team | null
  startAngle: number
  endAngle: number
  centerX: number
  centerY: number
  radius: number
}): JSX.Element {
  const { t } = useTranslation()
  const midAngle = (startAngle + endAngle) / 2
  const labelRadius = radius + 30
  const x = centerX + labelRadius * Math.cos(midAngle)
  const y = centerY + labelRadius * Math.sin(midAngle)

  // Sector arc
  const arcRadius = radius + 18
  const startX = centerX + arcRadius * Math.cos(startAngle)
  const startY = centerY + arcRadius * Math.sin(startAngle)
  const endX = centerX + arcRadius * Math.cos(endAngle)
  const endY = centerY + arcRadius * Math.sin(endAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0

  return (
    <g>
      {/* Sector arc line */}
      <path
        d={`M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${endX} ${endY}`}
        fill="none"
        stroke={team?.color || 'rgba(107, 114, 128, 0.3)'}
        strokeWidth={1}
        opacity={0.3}
      />
      {/* Team name */}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-[8px] font-mono uppercase tracking-wider"
        fill={team?.color || '#6b7280'}
        opacity={0.7}
        style={{ userSelect: 'none' }}
      >
        {team?.name || t('teamMgmt.unassigned')}
      </text>
    </g>
  )
}

export function ActivityMap({ teams, onAgentClick }: ActivityMapProps): JSX.Element {
  const { t } = useTranslation()
  const { agents } = useAppStore()
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  const svgWidth = 700
  const svgHeight = 420
  const centerX = svgWidth / 2
  const centerY = svgHeight / 2

  const { positions, teamSectors } = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    const sectors: { team: Team | null; startAngle: number; endAngle: number }[] = []

    if (activeAgents.length === 0) return { positions: pos, teamSectors: sectors }

    const groups = groupByTeam(activeAgents, teams)
    const totalAgents = activeAgents.length
    const radius = Math.min(svgWidth, svgHeight) / 2 - 70

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
  }, [activeAgents, teams, centerX, centerY, svgWidth, svgHeight])

  const stats = useMemo(() => {
    const total = activeAgents.length
    const active = activeAgents.filter((a) => a.status === 'active' || a.status === 'thinking' || a.status === 'tool_running').length
    const error = activeAgents.filter((a) => a.status === 'error').length
    return { total, active, error }
  }, [activeAgents])

  if (activeAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="text-sm font-mono opacity-50">{t('agent.noAgents')}</div>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#0a0a18] border border-gray-800/50">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)'
        }}
      />

      {/* Grid background */}
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ minHeight: '300px' }}
      >
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(99, 102, 241, 0.05)" strokeWidth="0.5" />
          </pattern>
          <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(99, 102, 241, 0.08)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
          </radialGradient>
        </defs>

        <rect width={svgWidth} height={svgHeight} fill="url(#grid)" />
        <circle cx={centerX} cy={centerY} r={200} fill="url(#center-glow)" />

        {/* Team sector labels */}
        {teamSectors.map((sector, i) => (
          <TeamSectorLabel
            key={i}
            team={sector.team}
            startAngle={sector.startAngle}
            endAngle={sector.endAngle}
            centerX={centerX}
            centerY={centerY}
            radius={Math.min(svgWidth, svgHeight) / 2 - 70}
          />
        ))}

        {/* Connection lines */}
        <ConnectionLines agents={activeAgents} positions={positions} />

        {/* Central hub */}
        <CentralHub centerX={centerX} centerY={centerY} stats={stats} />

        {/* Agent nodes */}
        {activeAgents.map((agent) => {
          const pos = positions.get(agent.id)
          if (!pos) return null
          return (
            <AgentNode
              key={agent.id}
              agent={agent}
              x={pos.x}
              y={pos.y}
              onClick={onAgentClick}
            />
          )
        })}
      </svg>

      {/* Corner decorations — command center frame */}
      <div className="pointer-events-none absolute top-2 left-2 w-6 h-6 border-t border-l border-indigo-500/20" />
      <div className="pointer-events-none absolute top-2 right-2 w-6 h-6 border-t border-r border-indigo-500/20" />
      <div className="pointer-events-none absolute bottom-2 left-2 w-6 h-6 border-b border-l border-indigo-500/20" />
      <div className="pointer-events-none absolute bottom-2 right-2 w-6 h-6 border-b border-r border-indigo-500/20" />

      {/* Timestamp footer */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-mono text-gray-600 tracking-widest">
        {t('activityMap.title', 'ACTIVITY MAP')} — {new Date().toLocaleTimeString()}
      </div>
    </div>
  )
}
