import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { SettingsModal } from '@components/SettingsModal'
import {
  LayoutDashboard,
  PanelRight,
  Settings,
  RotateCcw
} from 'lucide-react'
import { countLeaves } from '@appTypes/layout'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const { toggleDashboard, toggleRightPane, showDashboard, resetLayout, layoutTree, teamStats } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)
  const leafCount = countLeaves(layoutTree)

  return (
    <>
      <div className="titlebar-drag flex items-center justify-between h-9 bg-card border-b border-border px-4 pr-[140px] select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold">{t('app.title')}</span>
          {teamStats.total > 0 && (
            <div className="flex items-center gap-1.5 ml-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500">{teamStats.active} {t('titleBar.active', 'active')}</span>
              {teamStats.error > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500">{teamStats.error} {t('titleBar.error', 'err')}</span>
              )}
              {teamStats.awaiting > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-500">{teamStats.awaiting} {t('titleBar.awaiting', 'wait')}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Pane count indicator + reset */}
          {leafCount > 1 && (
            <button
              onClick={resetLayout}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-1"
              title={t('titleBar.resetLayout', 'Reset layout')}
            >
              <RotateCcw size={10} />
              <span>{leafCount} panes</span>
            </button>
          )}

          <button
            onClick={toggleDashboard}
            className={`p-1.5 rounded hover:bg-accent transition-colors ${showDashboard ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            title={t('dashboard.title')}
          >
            <LayoutDashboard size={16} />
          </button>
          <button
            onClick={toggleRightPane}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            title={t('titleBar.toggleContextPane', 'Toggle Context Pane')}
          >
            <PanelRight size={16} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            title={t('settings.title')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  )
}
