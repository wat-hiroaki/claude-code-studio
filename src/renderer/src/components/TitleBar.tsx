import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { SettingsModal } from './SettingsModal'
import { cn } from '../lib/utils'
import {
  LayoutDashboard,
  Radio,
  PanelRight,
  Settings,
  Square,
  Columns2,
  LayoutGrid
} from 'lucide-react'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const { toggleDashboard, toggleRightPane, toggleBroadcast, showDashboard, paneLayout, setPaneLayout } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)

  const layoutOptions: { layout: 1 | 2 | 4; icon: typeof Square; label: string }[] = [
    { layout: 1, icon: Square, label: '1' },
    { layout: 2, icon: Columns2, label: '2' },
    { layout: 4, icon: LayoutGrid, label: '4' }
  ]

  return (
    <>
      <div className="titlebar-drag flex items-center justify-between h-9 bg-card border-b border-border px-4 select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold">{t('app.title')}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Layout switcher */}
          <div className="flex items-center bg-secondary rounded p-0.5 mr-1">
            {layoutOptions.map(({ layout, icon: Icon, label }) => (
              <button
                key={layout}
                onClick={() => setPaneLayout(layout)}
                className={cn(
                  'p-1 rounded transition-colors',
                  paneLayout === layout
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={`${label} panel${layout > 1 ? 's' : ''}`}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>

          <button
            onClick={toggleDashboard}
            className={`p-1.5 rounded hover:bg-accent transition-colors ${showDashboard ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            title={t('dashboard.title')}
          >
            <LayoutDashboard size={16} />
          </button>
          <button
            onClick={toggleBroadcast}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            title={t('broadcast.title')}
          >
            <Radio size={16} />
          </button>
          <button
            onClick={toggleRightPane}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
            title="Toggle Context Pane"
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
