import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { GitBranch, Plus, X } from 'lucide-react'
import { TaskChainPanel } from './TaskChainPanel'
import type { TaskChain, ChainExecutionLog } from '@shared/types'

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
  gray: '#71717a',
  darkGray: '#18181b',
  grid: '#18181b',
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
  grid: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  panelBg: 'rgba(255, 255, 255, 0.95)',
  panelBorder: 'rgba(148, 163, 184, 0.5)'
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
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
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

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------
interface ChainGraphProps {
  onAgentClick: (id: string) => void
}

interface NodePosition {
  x: number
  y: number
}

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
function getEdgeColor(
  chain: TaskChain,
  lastLog: ChainExecutionLog | undefined,
  palette: CyberPalette
): string {
  if (!chain.isActive) return palette.gray
  if (!lastLog) return palette.gray
  switch (lastLog.status) {
    case 'running':
      return palette.cyan
    case 'completed':
      return palette.green
    case 'error':
      return palette.red
    default:
      return palette.gray
  }
}

function getConditionLabel(chain: TaskChain): string {
  const cond = chain.triggerCondition
  if (cond.type === 'scheduled') {
    return `\u23F0 ${cond.intervalMinutes ?? 0}min`
  }
  return cond.type
}

function computeNodePositions(agentIds: string[]): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>()
  const count = agentIds.length
  if (count === 0) return positions

  const svgW = 800
  const svgH = 400
  const paddingX = 100
  const paddingY = 80

  if (count <= 4) {
    // Single row, evenly spaced
    const spacing = (svgW - paddingX * 2) / Math.max(count - 1, 1)
    for (let i = 0; i < count; i++) {
      positions.set(agentIds[i], {
        x: count === 1 ? svgW / 2 : paddingX + spacing * i,
        y: svgH / 2
      })
    }
  } else {
    // 2-row grid
    const cols = Math.ceil(count / 2)
    const row1Y = paddingY + 50
    const row2Y = svgH - paddingY - 50

    for (let i = 0; i < count; i++) {
      const row = i < cols ? 0 : 1
      const col = row === 0 ? i : i - cols
      const totalInRow = row === 0 ? cols : count - cols
      const rowSpacing = (svgW - paddingX * 2) / Math.max(totalInRow - 1, 1)
      positions.set(agentIds[i], {
        x: totalInRow === 1 ? svgW / 2 : paddingX + rowSpacing * col,
        y: row === 0 ? row1Y : row2Y
      })
    }
  }

  return positions
}

function buildCurvedPath(
  from: NodePosition,
  to: NodePosition,
  edgeIndex: number,
  totalEdges: number
): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  // Perpendicular offset for multiple edges between same nodes
  const offset = totalEdges > 1 ? (edgeIndex - (totalEdges - 1) / 2) * 30 : 0
  const mx = (from.x + to.x) / 2 - (dy * 0.2) + offset * (dy === 0 ? 1 : -dy / Math.abs(dy || 1))
  const my = (from.y + to.y) / 2 + (dx * 0.2) + offset * (dx === 0 ? 0 : dx / Math.abs(dx || 1))
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
}

// ---------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------
function GraphNode({
  agentId,
  agentName,
  pos,
  statusColor,
  palette,
  onClick
}: {
  agentId: string
  agentName: string
  pos: NodePosition
  statusColor: string
  palette: CyberPalette
  onClick: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const nodeW = 120
  const nodeH = 50
  const rx = 8

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(agentId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <rect
        x={pos.x - nodeW / 2}
        y={pos.y - nodeH / 2}
        width={nodeW}
        height={nodeH}
        rx={rx}
        fill={palette.bg}
        stroke={hovered ? palette.textMain : palette.accent}
        strokeWidth={hovered ? 1.5 : 1}
        opacity={0.95}
      />
      {/* Status dot */}
      <circle
        cx={pos.x - nodeW / 2 + 14}
        cy={pos.y}
        r={4}
        fill={statusColor}
      />
      {/* Agent name */}
      <text
        x={pos.x + 4}
        y={pos.y + 4}
        textAnchor="middle"
        className="font-mono text-[11px] font-semibold"
        fill={palette.textMain}
        style={{ userSelect: 'none' }}
      >
        {agentName.length > 12 ? agentName.slice(0, 11) + '..' : agentName}
      </text>
    </g>
  )
}

function GraphEdge({
  chain,
  from,
  to,
  color,
  isRunning,
  isInactive,
  edgeIndex,
  totalEdges,
  palette
}: {
  chain: TaskChain
  from: NodePosition
  to: NodePosition
  color: string
  isRunning: boolean
  isInactive: boolean
  edgeIndex: number
  totalEdges: number
  palette: CyberPalette
}) {
  const path = buildCurvedPath(from, to, edgeIndex, totalEdges)
  const label = getConditionLabel(chain)
  const markerId = `arrow-${chain.id}`

  // Compute label position at midpoint of quadratic bezier
  const dx = to.x - from.x
  const dy = to.y - from.y
  const offset = totalEdges > 1 ? (edgeIndex - (totalEdges - 1) / 2) * 30 : 0
  const mx = (from.x + to.x) / 2 - (dy * 0.2) + offset * (dy === 0 ? 1 : -dy / Math.abs(dy || 1))
  const my = (from.y + to.y) / 2 + (dx * 0.2) + offset * (dx === 0 ? 0 : dx / Math.abs(dx || 1))
  // Midpoint of bezier (approximate: average of midpoint and control)
  const labelX = (from.x + 2 * mx + to.x) / 4
  const labelY = (from.y + 2 * my + to.y) / 4

  return (
    <g opacity={isInactive ? 0.4 : 1}>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M 0 0 L 8 3 L 0 6 Z" fill={color} />
        </marker>
      </defs>
      {/* Edge path */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={isInactive ? '6 4' : isRunning ? '8 4' : 'none'}
        markerEnd={`url(#${markerId})`}
      >
        {isRunning && (
          <animate
            attributeName="stroke-dashoffset"
            from="24"
            to="0"
            dur="0.8s"
            repeatCount="indefinite"
          />
        )}
      </path>
      {/* Label background */}
      <rect
        x={labelX - 28}
        y={labelY - 8}
        width={56}
        height={14}
        rx={3}
        fill={palette.bg}
        stroke={color}
        strokeWidth={0.5}
        opacity={0.9}
      />
      {/* Label text */}
      <text
        x={labelX}
        y={labelY + 3}
        textAnchor="middle"
        className="font-mono text-[9px] font-medium"
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}

// ---------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------
export function ChainGraph({ onAgentClick }: ChainGraphProps) {
  const { t } = useTranslation()
  const palette = useCyberPalette()
  const { agents } = useAppStore()

  const [chains, setChains] = useState<TaskChain[]>([])
  const [logs, setLogs] = useState<ChainExecutionLog[]>([])
  const [showPanel, setShowPanel] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [chainData, logData] = await Promise.all([
        window.api.getChains(),
        window.api.getChainExecutionLogs(50)
      ])
      setChains(chainData)
      setLogs(logData)
    } catch {
      // silently ignore fetch errors
    }
  }, [])

  // Initial fetch + polling every 10s
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Build agent map for name lookups
  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string; status: string }>()
    for (const agent of agents) {
      map.set(agent.id, { name: agent.name, status: agent.status })
    }
    return map
  }, [agents])

  // Determine which agents appear in chains
  const graphAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const chain of chains) {
      ids.add(chain.triggerAgentId)
      ids.add(chain.targetAgentId)
    }
    return [...ids]
  }, [chains])

  // Compute positions
  const positions = useMemo(
    () => computeNodePositions(graphAgentIds),
    [graphAgentIds]
  )

  // Build a map: chainId -> last execution log
  const lastLogByChain = useMemo(() => {
    const map = new Map<string, ChainExecutionLog>()
    // logs are presumably newest first; keep the first (latest) per chain
    for (const log of logs) {
      if (!map.has(log.chainId)) {
        map.set(log.chainId, log)
      }
    }
    return map
  }, [logs])

  // Count edges between same pair of nodes for offset calculation
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const indices = new Map<string, number>()
    for (const chain of chains) {
      const key = [chain.triggerAgentId, chain.targetAgentId].sort().join('|')
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return { counts, indices }
  }, [chains])

  const svgWidth = 800
  const svgHeight = 400

  // Status color for agent nodes
  const getAgentStatusColor = (agentId: string): string => {
    const agent = agentMap.get(agentId)
    if (!agent) return palette.gray
    const status = agent.status
    if (['active', 'thinking', 'tool_running'].includes(status)) return palette.green
    if (status === 'error') return palette.red
    if (status === 'awaiting') return palette.cyan
    return palette.gray
  }

  // Empty state
  if (chains.length === 0 && !showPanel) {
    return (
      <div
        className={cn(
          'w-full flex items-center justify-center border overflow-hidden font-mono relative rounded-md'
        )}
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.panelBorder,
          aspectRatio: '2 / 1'
        }}
      >
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <GitBranch size={28} style={{ color: palette.accent, opacity: 0.5 }} />
          <span
            className="text-xs tracking-wide opacity-60"
            style={{ color: palette.textMuted }}
          >
            {t(
              'chainGraph.empty',
              'No task chains configured. Create chains to see the dependency graph.'
            )}
          </span>
          <button
            onClick={() => setShowPanel(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: palette.cyan + '15',
              color: palette.cyan,
              border: `1px solid ${palette.cyan}40`
            }}
          >
            <Plus size={14} />
            {t('chainGraph.createChain', 'Create Chain')}
          </button>
        </div>
      </div>
    )
  }

  // Track edge indices for offset
  const edgeIndexTracker = new Map<string, number>()
  const getEdgeIndex = (triggerAgentId: string, targetAgentId: string): { index: number; total: number } => {
    const key = [triggerAgentId, targetAgentId].sort().join('|')
    const total = edgeCounts.counts.get(key) || 1
    const current = edgeIndexTracker.get(key) || 0
    edgeIndexTracker.set(key, current + 1)
    return { index: current, total }
  }

  return (
    <div className="w-full flex gap-2">
      <div className="flex-1 min-w-0">
      {/* Title */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <GitBranch size={14} style={{ color: palette.accent }} />
        <span
          className="font-mono text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: palette.textMuted }}
        >
          {t('chainGraph.title', 'Chains')}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
          style={{
            backgroundColor: showPanel ? palette.cyan + '15' : 'transparent',
            color: showPanel ? palette.cyan : palette.textMuted,
            border: `1px solid ${showPanel ? palette.cyan + '40' : palette.panelBorder}`
          }}
        >
          <Plus size={12} />
          {t('chainGraph.manage', 'Manage')}
        </button>
      </div>

      <div
        className="w-full rounded-md border overflow-hidden relative"
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.panelBorder
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full block"
          style={{ minHeight: '200px' }}
        >
          <defs>
            <filter id="chain-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Corner decorators */}
          <g opacity={0.3}>
            <path d="M 20 50 L 20 20 L 50 20" fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} 50 L ${svgWidth - 20} 20 L ${svgWidth - 50} 20`} fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M 20 ${svgHeight - 50} L 20 ${svgHeight - 20} L 50 ${svgHeight - 20}`} fill="none" stroke={palette.accent} strokeWidth={1} />
            <path d={`M ${svgWidth - 20} ${svgHeight - 50} L ${svgWidth - 20} ${svgHeight - 20} L ${svgWidth - 50} ${svgHeight - 20}`} fill="none" stroke={palette.accent} strokeWidth={1} />
          </g>

          {/* Edges */}
          {chains.map((chain) => {
            const fromPos = positions.get(chain.triggerAgentId)
            const toPos = positions.get(chain.targetAgentId)
            if (!fromPos || !toPos) return null

            const lastLog = lastLogByChain.get(chain.id)
            const color = getEdgeColor(chain, lastLog, palette)
            const isRunning = lastLog?.status === 'running'
            const isInactive = !chain.isActive
            const { index, total } = getEdgeIndex(chain.triggerAgentId, chain.targetAgentId)

            return (
              <GraphEdge
                key={chain.id}
                chain={chain}
                from={fromPos}
                to={toPos}
                color={color}
                isRunning={isRunning}
                isInactive={isInactive}
                edgeIndex={index}
                totalEdges={total}
                palette={palette}
              />
            )
          })}

          {/* Nodes */}
          {graphAgentIds.map((agentId) => {
            const pos = positions.get(agentId)
            if (!pos) return null
            const agentInfo = agentMap.get(agentId)
            const name = agentInfo?.name ?? agentId.slice(0, 8)

            return (
              <GraphNode
                key={agentId}
                agentId={agentId}
                agentName={name}
                pos={pos}
                statusColor={getAgentStatusColor(agentId)}
                palette={palette}
                onClick={onAgentClick}
              />
            )
          })}

          {/* Footer */}
          <text
            x={svgWidth / 2}
            y={svgHeight - 10}
            textAnchor="middle"
            className="font-mono text-[7px] uppercase tracking-[0.3em]"
            fill={palette.accent}
            opacity={0.4}
            style={{ userSelect: 'none' }}
          >
            CHAIN DEPENDENCY GRAPH
          </text>
        </svg>
      </div>
      </div>

      {/* Side panel: Chain management */}
      {showPanel && (
        <div className="w-80 shrink-0 border border-border rounded-md overflow-hidden bg-card flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
            <span className="text-xs font-medium">{t('chainGraph.manage', 'Manage')}</span>
            <button onClick={() => setShowPanel(false)} className="p-1 hover:bg-accent rounded transition-colors">
              <X size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <TaskChainPanel onChainChanged={fetchData} />
          </div>
        </div>
      )}
    </div>
  )
}
