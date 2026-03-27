import { useState } from 'react'
import type { CyberPalette } from '@lib/cyber-theme'
import type { ConfigNode } from '@shared/types'

interface ConfigMapNodeProps {
  node: ConfigNode
  x: number
  y: number
  palette: CyberPalette
  isConflicted: boolean
  isSelected: boolean
  onClick: (node: ConfigNode) => void
  onHoverChange?: (node: ConfigNode | null) => void
}

const CATEGORY_COLORS: Record<string, (p: CyberPalette) => string> = {
  rules: (p) => p.cyan,
  skills: (p) => p.orange,
  commands: (p) => p.orange,
  templates: (p) => p.orange,
  mcpServers: (p) => p.green,
  hooks: (p) => p.red,
  memory: (p) => p.purple,
  agents: (p) => p.purple,
  settings: (p) => p.gray
}

const LEVEL_COLORS: Record<string, (p: CyberPalette) => string> = {
  global: (p) => p.cyan,
  project: (p) => p.green,
  agent: (p) => p.purple
}

const CATEGORY_ICONS: Record<string, string> = {
  rules: '\u2630',      // ☰ FileText
  skills: '\u26A1',     // ⚡ Zap
  commands: '\u25B6',   // ▶ Terminal
  templates: '\u25A6',  // ▦ Layout
  mcpServers: '\u25CE', // ◎ Server
  hooks: '\u25C6',      // ◆ Shield
  memory: '\u25CF',     // ● Brain
  agents: '\u2726',     // ✦ Bot
  settings: '\u2699'    // ⚙ Settings
}

export function ConfigMapNode({ node, x, y, palette, isConflicted, isSelected, onClick, onHoverChange }: ConfigMapNodeProps): JSX.Element {
  const [hovered, setHovered] = useState(false)

  const categoryColor = (CATEGORY_COLORS[node.category] ?? (() => palette.accent))(palette)
  const levelColor = (LEVEL_COLORS[node.level] ?? (() => palette.accent))(palette)
  const icon = CATEGORY_ICONS[node.category] || '\u25CB'
  const nodeRadius = 26

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'pointer' }}
      onClick={() => onClick(node)}
      onMouseEnter={() => { setHovered(true); onHoverChange?.(node) }}
      onMouseLeave={() => { setHovered(false); onHoverChange?.(null) }}
    >
      {/* Glow ring */}
      {(isSelected || hovered) && (
        <circle
          r={nodeRadius + 6}
          fill="none"
          stroke={categoryColor}
          strokeWidth={1.5}
          opacity={0.4}
        />
      )}

      {/* Conflict warning ring */}
      {isConflicted && (
        <circle
          r={nodeRadius + 4}
          fill="none"
          stroke={palette.red}
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.8}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            dur="8s"
            repeatCount="indefinite"
            from="0 0 0"
            to="360 0 0"
          />
        </circle>
      )}

      {/* Main circle */}
      <circle
        r={nodeRadius}
        fill={palette.bg}
        stroke={categoryColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        opacity={0.95}
      />

      {/* Level indicator strip */}
      <line
        x1={-nodeRadius + 6}
        y1={nodeRadius - 1}
        x2={nodeRadius - 6}
        y2={nodeRadius - 1}
        stroke={levelColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.7}
      />

      {/* Category icon */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        y={-3}
        fontSize={16}
        fill={categoryColor}
        style={{ userSelect: 'none' }}
      >
        {icon}
      </text>

      {/* Label */}
      <text
        textAnchor="middle"
        y={nodeRadius + 14}
        className="font-mono"
        fontSize={8}
        fill={palette.textMain}
        style={{ userSelect: 'none' }}
      >
        {node.label.length > 22 ? node.label.slice(0, 20) + '..' : node.label}
      </text>

      {/* Level tag */}
      <text
        textAnchor="middle"
        y={nodeRadius + 24}
        className="font-mono uppercase"
        fontSize={6}
        fill={palette.textMuted}
        style={{ userSelect: 'none' }}
      >
        {node.level}
      </text>

    </g>
  )
}
