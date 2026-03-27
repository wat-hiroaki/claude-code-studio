import { useTranslation } from 'react-i18next'
import { Globe, FolderOpen } from 'lucide-react'
import type { CyberPalette } from '@lib/cyber-theme'
import type { ConfigMapData } from '@shared/types'

interface ConfigMapToolbarProps {
  viewMode: 'overview' | 'detail'
  setViewMode: (mode: 'overview' | 'detail') => void
  palette: CyberPalette
  availablePaths: Map<string, string>
  resolvedPath: string | null
  setSelectedPath: (path: string | null) => void
  data: ConfigMapData | null
}

export function ConfigMapToolbar({
  viewMode,
  setViewMode,
  palette,
  availablePaths,
  resolvedPath,
  setSelectedPath,
  data
}: ConfigMapToolbarProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      {/* Mode toggle + Workspace selector */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0" style={{ borderColor: palette.panelBorder }}>
        <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setViewMode('overview')}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <Globe size={11} />
            {t('configMap.overview')}
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-card shadow-sm font-medium"
          >
            <FolderOpen size={11} />
            {t('configMap.detailView')}
          </button>
        </div>
      </div>

      {/* Workspace selector */}
      {availablePaths.size > 1 && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono border-b overflow-x-auto shrink-0"
          style={{ borderColor: palette.panelBorder }}
        >
          {Array.from(availablePaths.entries()).map(([path, name]) => (
            <button
              key={path}
              onClick={() => setSelectedPath(path)}
              className="px-2 py-0.5 rounded transition-colors whitespace-nowrap"
              style={{
                backgroundColor: resolvedPath === path ? palette.cyan + '20' : 'transparent',
                color: resolvedPath === path ? palette.cyan : palette.textMuted,
                border: `1px solid ${resolvedPath === path ? palette.cyan + '40' : palette.panelBorder}`
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Conflict summary bar */}
      {data && data.conflicts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b" style={{ borderColor: palette.panelBorder, backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <span style={{ color: palette.red }}>&#x26A0;</span>
          <span style={{ color: palette.red }}>
            {data.conflicts.length} {t('configMap.conflictsFound')}
          </span>
          <span style={{ color: palette.textMuted }}>
            {data.conflicts.map(c => c.description).join(' | ')}
          </span>
        </div>
      )}
    </>
  )
}
