import { useTranslation } from 'react-i18next'
import { Plus, Minus, Maximize, Maximize2, X } from 'lucide-react'
import { ConfigMapNode } from '@components/configMap/configMapNode'
import {
  CATEGORY_SECTORS,
  EDGE_STYLES,
  GROUP_DEFS,
  describeArc,
  SVG_WIDTH,
  SVG_HEIGHT
} from '@components/configMap/useConfigMapData'
import type { CyberPalette } from '@lib/cyber-theme'
import type { ConfigMapData } from '@shared/types'

interface ConfigMapCanvasProps {
  data: ConfigMapData | null
  palette: CyberPalette
  svgRef: React.RefObject<SVGSVGElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  pan: { x: number; y: number }
  scale: number
  cx: number
  cy: number
  nodePositions: Map<string, { x: number; y: number }>
  conflictedNodeIds: Set<string>
  activeGroups: Set<string>
  selectedNode: ConfigMapData['nodes'][0] | null
  hoveredNode: ConfigMapData['nodes'][0] | null
  tooltipPos: { x: number; y: number }
  isFullscreen: boolean
  handlePointerDown: (e: React.PointerEvent) => void
  handlePointerMove: (e: React.PointerEvent) => void
  handlePointerUp: () => void
  handleContainerMouseMove: (e: React.MouseEvent) => void
  handleNodeClick: (node: ConfigMapData['nodes'][0]) => void
  handleNodeHoverChange: (node: ConfigMapData['nodes'][0] | null) => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleZoomFit: () => void
  handleToggleFullscreen: () => void
}

export function ConfigMapCanvas({
  data, palette, svgRef, containerRef,
  pan, scale, cx, cy,
  nodePositions, conflictedNodeIds, activeGroups,
  selectedNode, hoveredNode, tooltipPos,
  isFullscreen,
  handlePointerDown, handlePointerMove, handlePointerUp,
  handleContainerMouseMove,
  handleNodeClick, handleNodeHoverChange,
  handleZoomIn, handleZoomOut, handleZoomFit, handleToggleFullscreen
}: ConfigMapCanvasProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      ref={containerRef}
      className="flex-1 rounded-md border shadow-xl overflow-hidden select-none cursor-grab active:cursor-grabbing relative"
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
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <filter id="config-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="arrow-inherits" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.cyan} opacity={0.9} />
          </marker>
          <marker id="arrow-overrides" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.red} opacity={0.9} />
          </marker>
          <marker id="arrow-configures" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 3 L 0 6 z" fill={palette.gray} opacity={0.9} />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {/* Group sector arcs */}
          {GROUP_DEFS.map(gd => {
            if (!activeGroups.has(gd.group)) return null
            const groupColor = gd.color === 'cyan' ? palette.cyan :
                               gd.color === 'green' ? palette.green :
                               gd.color === 'orange' ? palette.orange :
                               palette.purple
            return (
              <g key={gd.group}>
                <path d={describeArc(cx, cy, 160, gd.startAngle, gd.endAngle)} fill="none" stroke={groupColor} strokeWidth={0.5} opacity={0.15} />
                <path d={describeArc(cx, cy, 340, gd.startAngle, gd.endAngle)} fill="none" stroke={groupColor} strokeWidth={0.5} opacity={0.1} />
                {(() => {
                  const midAngle = ((gd.startAngle + gd.endAngle) / 2 * Math.PI) / 180
                  const labelR = 355
                  return (
                    <text
                      x={cx + labelR * Math.cos(midAngle)} y={cy + labelR * Math.sin(midAngle)}
                      textAnchor="middle" dominantBaseline="central"
                      className="font-mono uppercase" fontSize={9}
                      fill={groupColor} opacity={0.35} letterSpacing={2}
                      style={{ userSelect: 'none' }}
                    >
                      {gd.label}
                    </text>
                  )
                })()}
              </g>
            )
          })}

          {/* Center project label */}
          <circle cx={cx} cy={cy} r={42} fill={palette.bg} stroke={palette.cyan} strokeWidth={1} opacity={0.6} />
          <circle cx={cx} cy={cy} r={38} fill="none" stroke={palette.cyan} strokeWidth={0.5} opacity={0.2} />
          <text x={cx} y={cy - 5} textAnchor="middle" className="font-mono" fontSize={11} fill={palette.cyan} fontWeight="bold" style={{ userSelect: 'none' }}>
            {data?.projectName || ''}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" className="font-mono uppercase" fontSize={7} fill={palette.textMuted} style={{ userSelect: 'none' }}>
            {t('configMap.title')}
          </text>

          {/* Category sector labels */}
          {data && Object.entries(CATEGORY_SECTORS).map(([cat, sector]) => {
            const hasNodes = data.nodes.some(n => n.category === cat)
            if (!hasNodes) return null
            const angle = (sector.angle * Math.PI) / 180
            const labelR = sector.baseRadius - 40
            return (
              <text
                key={cat}
                x={cx + labelR * Math.cos(angle)} y={cy + labelR * Math.sin(angle)}
                textAnchor="middle" dominantBaseline="central"
                className="font-mono uppercase" fontSize={7}
                fill={palette.textMuted} opacity={0.4} style={{ userSelect: 'none' }}
              >
                {t('configMap.category.' + cat)}
              </text>
            )
          })}

          {/* Edges */}
          {data?.edges.map((edge, i) => {
            const from = nodePositions.get(edge.from)
            const to = nodePositions.get(edge.to)
            if (!from || !to) return null
            const style = EDGE_STYLES[edge.relationship] || EDGE_STYLES.references
            const color = style.stroke === 'cyan' ? palette.cyan :
                          style.stroke === 'red' ? palette.red :
                          style.stroke === 'accent' ? palette.accent :
                          palette.gray
            const markerId = edge.relationship === 'references' ? '' : `url(#arrow-${edge.relationship})`
            const dx = to.x - from.x, dy = to.y - from.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 1) return null
            const nx = dx / dist, ny = dy / dist
            return (
              <line key={`edge-${i}`}
                x1={from.x + nx * 32} y1={from.y + ny * 32}
                x2={to.x - nx * 32} y2={to.y - ny * 32}
                stroke={color} strokeWidth={style.width}
                strokeDasharray={style.dasharray} markerEnd={markerId} opacity={0.8}
              />
            )
          })}

          {/* Nodes */}
          {data?.nodes.map((node) => {
            const pos = nodePositions.get(node.id)
            if (!pos) return null
            return (
              <ConfigMapNode key={node.id} node={node} x={pos.x} y={pos.y} palette={palette}
                isConflicted={conflictedNodeIds.has(node.id)} isSelected={selectedNode?.id === node.id}
                onClick={handleNodeClick} onHoverChange={handleNodeHoverChange}
              />
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 px-3 py-2 rounded text-[9px] font-mono flex flex-col gap-1.5"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}` }}>
        <div className="flex gap-3">
          <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.level')}:</span>
          <span style={{ color: palette.cyan }}>&#9644; {t('configMap.levelGlobal')}</span>
          <span style={{ color: palette.green }}>&#9644; {t('configMap.levelProject')}</span>
          <span style={{ color: palette.purple }}>&#9644; {t('configMap.levelAgent')}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.category.label')}:</span>
          <span style={{ color: palette.cyan }}>&#9679; {t('configMap.category.rules')}</span>
          <span style={{ color: palette.green }}>&#9679; {t('configMap.category.mcpServers')}</span>
          <span style={{ color: palette.orange }}>&#9679; {t('configMap.category.skills')}/{t('configMap.category.commands')}/{t('configMap.category.templates')}</span>
          <span style={{ color: palette.red }}>&#9679; {t('configMap.category.hooks')}</span>
          <span style={{ color: palette.purple }}>&#9679; {t('configMap.category.memory')}/{t('configMap.category.agents')}</span>
          <span style={{ color: palette.gray }}>&#9679; {t('configMap.category.settings')}</span>
        </div>
        <div className="flex gap-3">
          <span style={{ color: palette.textMuted, fontSize: '8px' }}>{t('configMap.edges')}:</span>
          <span style={{ color: palette.cyan }}>— {t('configMap.relationship.inherits')}</span>
          <span style={{ color: palette.red }}>╌ {t('configMap.relationship.overrides')}</span>
          <span style={{ color: palette.accent }}>┈ {t('configMap.relationship.references')}</span>
          <span style={{ color: palette.gray }}>╌ {t('configMap.relationship.configures')}</span>
        </div>
      </div>

      {/* Node count */}
      {data && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded text-[9px] font-mono"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}>
          {data.nodes.length} {t('configMap.nodes')} / {data.edges.length} {t('configMap.edges')}
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute pointer-events-none font-mono" style={{
          left: tooltipPos.x, top: tooltipPos.y, zIndex: 50,
          backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`,
          borderRadius: 6, padding: '8px 10px', maxWidth: 220,
          backdropFilter: 'blur(8px)', transform: 'translateY(-100%)'
        }}>
          <div className="text-[11px] font-bold mb-1" style={{ color: palette.textMain }}>{hoveredNode.label}</div>
          <div className="text-[10px] mb-0.5" style={{ color: palette.textMuted }}>
            {t('configMap.category.' + hoveredNode.category)} / {hoveredNode.level}
          </div>
          {(hoveredNode.lineCount > 0 || hoveredNode.sizeBytes > 0) && (
            <div className="text-[10px] mb-0.5" style={{ color: palette.textMuted }}>
              {hoveredNode.lineCount > 0 ? `${hoveredNode.lineCount} lines` : ''}
              {hoveredNode.sizeBytes > 0 ? ` (${(hoveredNode.sizeBytes / 1024).toFixed(1)}KB)` : ''}
            </div>
          )}
          {hoveredNode.preview && (
            <div className="text-[9px] mt-1 opacity-70 line-clamp-2" style={{ color: palette.textMuted }}>
              {hoveredNode.preview.slice(0, 80).replace(/\n/g, ' ')}
            </div>
          )}
          {conflictedNodeIds.has(hoveredNode.id) && (
            <div className="text-[10px] mt-1 font-bold" style={{ color: palette.red }}>{t('configMap.conflictWarning')}</div>
          )}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 pointer-events-auto" style={{ zIndex: 20 }}>
        <button onClick={handleToggleFullscreen} className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
          title={isFullscreen ? t('configMap.exitFullscreen') : t('configMap.fullscreen')}>
          {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
        </button>
        <div className="h-px" />
        <button onClick={handleZoomIn} className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
          title={t('configMap.zoomIn')}><Plus size={14} /></button>
        <div className="text-center text-[9px] font-mono py-0.5 rounded"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted, minWidth: '30px' }}>
          {Math.round(scale * 100)}%
        </div>
        <button onClick={handleZoomOut} className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
          title={t('configMap.zoomOut')}><Minus size={14} /></button>
        <div className="h-px" />
        <button onClick={handleZoomFit} className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
          title={t('configMap.zoomFit')}><Maximize size={14} /></button>
      </div>
    </div>
  )
}
