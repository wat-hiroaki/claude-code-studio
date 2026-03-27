import { useTranslation } from 'react-i18next'
import { Plus, Minus, Maximize, GripHorizontal } from 'lucide-react'
import type { CyberPalette } from './types'

// ---------------------------------------------------------
// ZOOM CONTROLS
// ---------------------------------------------------------
interface ZoomControlsProps {
  palette: CyberPalette
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
}

export function ZoomControls({ palette, scale, onZoomIn, onZoomOut, onZoomFit }: ZoomControlsProps) {
  const { t } = useTranslation()

  return (
    <div
      className="absolute bottom-2 right-2 flex flex-col gap-1 pointer-events-auto"
      style={{ zIndex: 20 }}
    >
      <button
        onClick={onZoomIn}
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
        onClick={onZoomOut}
        className="p-1.5 rounded transition-colors hover:opacity-80"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
        title={t('activityMap.zoomOut')}
      >
        <Minus size={14} />
      </button>
      <div className="h-px" />
      <button
        onClick={onZoomFit}
        className="p-1.5 rounded transition-colors hover:opacity-80"
        style={{ backgroundColor: palette.panelBg, border: `1px solid ${palette.panelBorder}`, color: palette.textMuted }}
        title={t('activityMap.zoomFit')}
      >
        <Maximize size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------
// RESIZE HANDLE
// ---------------------------------------------------------
interface ResizeHandleProps {
  palette: CyberPalette
  mapHeight: number
  setMapHeight: (h: number) => void
}

export function ResizeHandle({ palette, mapHeight, setMapHeight }: ResizeHandleProps) {
  return (
    <div
      className="w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize py-1"
      onPointerDown={(e) => {
        e.preventDefault()
        const startY = e.clientY
        const startHeight = mapHeight

        const onMove = (me: PointerEvent) => {
          const delta = me.clientY - startY
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
  )
}
