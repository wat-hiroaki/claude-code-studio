import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConfigNode } from '@shared/types'

interface ConfigMapNodeProps {
  node: ConfigNode
  x: number
  y: number
  palette: CyberPalette
  isConflicted: boolean
  isSelected: boolean
  onClick: (node: ConfigNode) => void
}

interface CyberPalette {
  bg: string
  accent: string
  cyan: string
  green: string
  orange: string
  red: string
  purple: string
  gray: string
  darkGray: string
  textMain: string
  textMuted: string
  panelBg: string
  panelBorder: string
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

export function ConfigMapNode({ node, x, y, palette, isConflicted, isSelected, onClick }: ConfigMapNodeProps): JSX.Element {
  const { t } = useTranslation()
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* Tooltip on hover */}
      {hovered && (
        <g>
          <rect
            x={nodeRadius + 10}
            y={-40}
            width={180}
            height={72}
            rx={4}
            fill={palette.panelBg}
            stroke={palette.panelBorder}
            strokeWidth={1}
          />
          <text x={nodeRadius + 18} y={-24} fontSize={8} fill={palette.textMain} className="font-mono" fontWeight="bold">
            {node.label}
          </text>
          <text x={nodeRadius + 18} y={-12} fontSize={7} fill={palette.textMuted} className="font-mono">
            {t('configMap.category.' + node.category)} / {node.level}
          </text>
          <text x={nodeRadius + 18} y={0} fontSize={7} fill={palette.textMuted} className="font-mono">
            {node.lineCount > 0 ? `${node.lineCount} lines` : ''} {node.sizeBytes > 0 ? `(${(node.sizeBytes / 1024).toFixed(1)}KB)` : ''}
          </text>
          <text x={nodeRadius + 18} y={12} fontSize={6.5} fill={palette.textMuted} className="font-mono" opacity={0.7}>
            {node.preview.slice(0, 60).replace(/\n/g, ' ')}
          </text>
          {isConflicted && (
            <text x={nodeRadius + 18} y={24} fontSize={7} fill={palette.red} className="font-mono">
              {t('configMap.conflictWarning')}
            </text>
          )}
        </g>
      )}
    </g>
  )
}
