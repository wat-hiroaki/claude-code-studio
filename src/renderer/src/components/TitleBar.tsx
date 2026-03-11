import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { SettingsModal } from './SettingsModal'
import {
  LayoutDashboard,
  Radio,
  PanelRight,
  Settings
} from 'lucide-react'

export function TitleBar(): JSX.Element {
  const { t } = useTranslation()
  const { toggleDashboard, toggleRightPane, toggleBroadcast, showDashboard } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <div className="titlebar-drag flex items-center justify-between h-9 bg-card border-b border-border px-4 select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm font-semibold">{t('app.title')}</span>
        </div>

        <div className="flex items-center gap-1">
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
