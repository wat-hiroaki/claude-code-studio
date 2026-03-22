import type { Agent, AgentStatus, ClaudeTaskSession, Team } from '@shared/types'
import { AgentNode, ExternalCliNode, DataStreams, SystemCore, CyberSectorLabel } from './activityMapAgent'
import { ZoomControls } from './activityMapToolbar'
import type { CyberPalette, CyberStyle } from './types'
import { SVG_WIDTH, SVG_HEIGHT } from './types'

interface ChainFlowAnimation {
  id: string
  fromAgentId: string
  toAgentId: string
  chainName: string
  firedAt: number
}

// ---------------------------------------------------------
// SVG GRID / CANVAS
// ---------------------------------------------------------
interface ActivityMapGridProps {
  palette: CyberPalette
  statusTheme: Record<AgentStatus, CyberStyle>
  svgRef: React.RefObject<SVGSVGElement | null>
  scale: number
  pan: { x: number; y: number }
  mapHeight: number
  centerX: number
  centerY: number
  // Pointer handlers
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
  // Layout data
  teamSectors: { team: Team | null; startAngle: number; endAngle: number }[]
  machineLabels: { name: string; isSSH: boolean; x: number; y: number }[]
  projectLabels: { name: string; x: number; y: number }[]
  positions: Map<string, { x: number; y: number }>
  externalPositions: Map<string, { x: number; y: number }>
  // Agents
  activeAgents: Agent[]
  activeExternalSessions: ClaudeTaskSession[]
  activeChainFlows: ChainFlowAnimation[]
  pulsingAgents: Set<string>
  stats: { total: number; active: number; error: number; staleCli: number }
  agentMemory: Record<string, number>
  resolveWorkspaceName: (agent: Agent) => string
  onAgentNodeClick: (id: string) => void
  // Zoom
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
  // Cockpit overlay
  cockpitOverlay: React.ReactNode
}

export function ActivityMapGrid({
  palette,
  statusTheme,
  svgRef,
  scale,
  pan,
  mapHeight,
  centerX,
  centerY,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  teamSectors,
  machineLabels,
  projectLabels,
  positions,
  externalPositions,
  activeAgents,
  activeExternalSessions,
  activeChainFlows,
  pulsingAgents,
  stats,
  agentMemory,
  resolveWorkspaceName,
  onAgentNodeClick,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  cockpitOverlay
}: ActivityMapGridProps) {
  return (
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
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full block"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
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
          {machineLabels.map((ml, i) => {
            const label = ml.isSSH
              ? `SSH: ${ml.name.length > 8 ? ml.name.slice(0, 7) + '..' : ml.name}`
              : ml.name.length > 10 ? ml.name.slice(0, 9) + '..' : ml.name
            const labelWidth = Math.max(88, label.length * 7 + 16)
            return (
              <g key={`machine-${i}`}>
                <rect x={ml.x - labelWidth / 2} y={ml.y - 8} width={labelWidth} height={16} fill={palette.bg} stroke={ml.isSSH ? palette.orange : palette.accent} strokeWidth={ml.isSSH ? 1.5 : 0.6} rx={3} opacity={0.9} />
                <text x={ml.x} y={ml.y + 3} textAnchor="middle" className="font-mono text-[8px] uppercase tracking-wider font-semibold" fill={ml.isSSH ? palette.orange : palette.textMuted} style={{ userSelect: 'none' }}>
                  {label}
                </text>
              </g>
            )
          })}

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
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={palette.cyan} strokeWidth={2.5} opacity={0.6} filter="url(#cyber-glow)" />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={palette.cyan} strokeWidth={1} strokeDasharray="8 4" opacity={0.9}>
                  <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.6s" repeatCount="indefinite" />
                </line>
                <circle r={4} fill={palette.cyan} filter="url(#cyber-glow)">
                  <animateMotion dur="0.8s" repeatCount="indefinite" path={`M${from.x},${from.y} L${to.x},${to.y}`} />
                </circle>
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
                {pulsingAgents.has(agent.id) && (
                  <circle cx={pos.x} cy={pos.y} r={12} fill="none" stroke={palette.cyan} strokeWidth={2} opacity={0.8}>
                    <animate attributeName="r" values="12;28" dur="1s" repeatCount="3" />
                    <animate attributeName="opacity" values="0.8;0" dur="1s" repeatCount="3" />
                  </circle>
                )}
                <AgentNode agent={agent} x={pos.x} y={pos.y} onClick={onAgentNodeClick} palette={palette} statusTheme={statusTheme} workspaceName={resolveWorkspaceName(agent)} memoryMB={agentMemory[agent.id] || 0} />
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
        <text x={centerX} y={SVG_HEIGHT - 15} textAnchor="middle" className="font-mono text-[7px] uppercase tracking-[0.4em]" fill={palette.accent} opacity={0.5} style={{ userSelect: 'none' }}>
          CLAUDE-AGENTDECK :: TACTICAL OVERVIEW
        </text>
      </svg>

      {/* Zoom controls */}
      <ZoomControls
        palette={palette}
        scale={scale}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomFit={onZoomFit}
      />

      {/* Cockpit Overlay */}
      {cockpitOverlay}
    </div>
  )
}
