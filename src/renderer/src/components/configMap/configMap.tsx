import { useTranslation } from 'react-i18next'
import { Maximize2, X, Globe, FolderOpen, GripHorizontal } from 'lucide-react'
import { cyberPaletteDark, cyberPaletteLight, useResolvedTheme } from '@lib/cyber-theme'
import { ConfigMapDetailPanel } from '@components/configMap/configMapDetail'
import { ConfigMapOverview } from '@components/ConfigMapOverview'
import { ConfigMapToolbar } from '@components/configMap/configMapToolbar'
import { ConfigMapCanvas } from '@components/configMap/configMapCanvas'
import { useConfigMapData } from '@components/configMap/useConfigMapData'
import type { Workspace } from '@shared/types'

interface ConfigMapProps {
  workspaces: Workspace[]
}

export function ConfigMap({ workspaces }: ConfigMapProps): JSX.Element {
  const { t } = useTranslation()
  const resolved = useResolvedTheme()
  const palette = resolved === 'dark' ? cyberPaletteDark : cyberPaletteLight

  const state = useConfigMapData(workspaces)

  // Overview mode
  if (state.viewMode === 'overview') {
    return (
      <div className={state.isFullscreen ? 'h-full relative' : 'group'}>
        <div style={state.isFullscreen ? { height: '100%' } : { height: `${state.mapHeight}px` }} className="relative">
          <ViewModeTabs viewMode="overview" setViewMode={state.setViewMode} palette={palette} />
          <FullscreenButton isFullscreen={state.isFullscreen} onToggle={state.handleToggleFullscreen} palette={palette} />
          <ConfigMapOverview workspaces={workspaces} onDrillDown={state.handleDrillDown} />
        </div>
        {!state.isFullscreen && <ResizeHandle palette={palette} mapHeight={state.mapHeight} setMapHeight={state.setMapHeight} />}
      </div>
    )
  }

  // No project path
  if (!state.resolvedPath) {
    return (
      <div className="w-full flex items-center justify-center border overflow-hidden font-mono relative rounded-md"
        style={{ backgroundColor: palette.bg, borderColor: palette.panelBorder, height: `${state.mapHeight}px` }}>
        <div className="text-sm tracking-widest opacity-50 flex flex-col items-center" style={{ color: palette.textMuted }}>
          <span className="mb-2 uppercase">[ {t('configMap.noWorkspace')} ]</span>
          <span className="text-xs">{t('configMap.selectWorkspace')}</span>
        </div>
      </div>
    )
  }

  // Loading
  if (state.loading) {
    return (
      <div className="w-full flex items-center justify-center border overflow-hidden font-mono relative rounded-md"
        style={{ backgroundColor: palette.bg, borderColor: palette.panelBorder, height: `${state.mapHeight}px` }}>
        <span className="animate-pulse tracking-widest" style={{ color: palette.cyan }}>SCANNING CONFIG...</span>
      </div>
    )
  }

  // Detail view
  return (
    <div className={state.isFullscreen ? '' : 'group'}>
      <div className="flex w-full" style={state.isFullscreen ? { height: '100%' } : { height: `${state.mapHeight}px` }}>
        <div className="flex-1 min-w-0 flex flex-col">
          <ConfigMapToolbar
            viewMode={state.viewMode} setViewMode={state.setViewMode} palette={palette}
            availablePaths={state.availablePaths} resolvedPath={state.resolvedPath}
            setSelectedPath={state.setSelectedPath} data={state.data}
          />
          <ConfigMapCanvas
            data={state.data} palette={palette}
            svgRef={state.svgRef} containerRef={state.containerRef}
            pan={state.pan} scale={state.scale} cx={state.cx} cy={state.cy}
            nodePositions={state.nodePositions} conflictedNodeIds={state.conflictedNodeIds}
            activeGroups={state.activeGroups} selectedNode={state.selectedNode}
            hoveredNode={state.hoveredNode} tooltipPos={state.tooltipPos}
            isFullscreen={state.isFullscreen}
            handlePointerDown={state.handlePointerDown} handlePointerMove={state.handlePointerMove}
            handlePointerUp={state.handlePointerUp} handleContainerMouseMove={state.handleContainerMouseMove}
            handleNodeClick={state.handleNodeClick} handleNodeHoverChange={state.handleNodeHoverChange}
            handleZoomIn={state.handleZoomIn} handleZoomOut={state.handleZoomOut}
            handleZoomFit={state.handleZoomFit} handleToggleFullscreen={state.handleToggleFullscreen}
          />
        </div>
        {state.selectedNode && state.data && (
          <ConfigMapDetailPanel node={state.selectedNode} conflicts={state.data.conflicts} onClose={() => state.setSelectedNode(null)} />
        )}
      </div>
      {!state.isFullscreen && <ResizeHandle palette={palette} mapHeight={state.mapHeight} setMapHeight={state.setMapHeight} />}
    </div>
  )
}

function ViewModeTabs({ viewMode, setViewMode, palette: _palette }: {
  viewMode: string; setViewMode: (v: 'overview' | 'detail') => void; palette: { panelBg: string }
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex gap-0.5 bg-secondary rounded-lg p-0.5" style={{ zIndex: 20 }}>
      <button onClick={() => setViewMode('overview')}
        className={`flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md ${viewMode === 'overview' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}>
        <Globe size={12} />{t('configMap.overview')}
      </button>
      <button onClick={() => setViewMode('detail')}
        className={`flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-md ${viewMode === 'detail' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}`}>
        <FolderOpen size={12} />{t('configMap.detailView')}
      </button>
    </div>
  )
}

function FullscreenButton({ isFullscreen, onToggle, palette }: {
  isFullscreen: boolean; onToggle: () => void; palette: { panelBg: string; panelBorder: string; textMuted: string }
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1" style={{ zIndex: 20 }}>
      <button onClick={onToggle} className="p-1.5 rounded transition-colors hover:opacity-80"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
        title={isFullscreen ? t('configMap.exitFullscreen') : t('configMap.fullscreen')}>
        {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
      </button>
    </div>
  )
}

function ResizeHandle({ palette, mapHeight, setMapHeight }: {
  palette: { gray: string; textMuted: string }; mapHeight: number; setMapHeight: (h: number) => void
}): JSX.Element {
  return (
    <div className="w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize py-1"
      onPointerDown={(e) => {
        e.preventDefault()
        const startY = e.clientY, startHeight = mapHeight
        const onMove = (me: PointerEvent): void => { setMapHeight(Math.max(300, Math.min(startHeight + me.clientY - startY, 1200))) }
        const onUp = (): void => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
      }}>
      <div className="h-1.5 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${palette.gray}80` }}>
        <GripHorizontal size={10} style={{ color: palette.textMuted }} />
      </div>
    </div>
  )
}
