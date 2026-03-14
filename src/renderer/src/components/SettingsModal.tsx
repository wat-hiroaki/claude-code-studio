import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { X, Moon, Sun, Monitor, Globe, Bell, Terminal, Database, FolderOpen, Settings2 } from 'lucide-react'
import { showToast } from './ToastContainer'
import { cn } from '../lib/utils'
import { ConfigPanel } from './ConfigPanel'
import { DiagnosticsPanel } from './DiagnosticsPanel'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const { theme, setTheme, usePtyMode, setUsePtyMode, terminalFontSize, setTerminalFontSize } = useAppStore()
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('notifications')
    return saved ? JSON.parse(saved) : {
      enabled: true,
      sound: true,
      taskComplete: true,
      approvalRequired: true,
      errors: true
    }
  })

  const updateNotification = (key: string, value: boolean): void => {
    const updated = { ...notifications, [key]: value }
    setNotifications(updated)
    localStorage.setItem('notifications', JSON.stringify(updated))
  }

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system'): void => {
    setTheme(newTheme)
  }

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [theme])

  const handleLanguageChange = (lang: string): void => {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[560px] max-h-[80vh] overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{t('settings.title')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(80vh-60px)] scrollbar-thin scrollbar-thumb-border">
          {/* Theme */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Sun size={16} />
              {t('settings.theme')}
            </div>
            <div className="flex gap-2">
              {([
                { value: 'light' as const, icon: Sun, label: t('settings.themes.light') },
                { value: 'dark' as const, icon: Moon, label: t('settings.themes.dark') },
                { value: 'system' as const, icon: Monitor, label: t('settings.themes.system') }
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => handleThemeChange(value)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg text-sm border transition-colors',
                    theme === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <Icon size={14} className="inline mr-2" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Globe size={16} />
              {t('settings.language')}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleLanguageChange('en')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm border transition-colors',
                  i18n.language === 'en'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                )}
              >
                English
              </button>
              <button
                onClick={() => handleLanguageChange('ja')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm border transition-colors',
                  i18n.language === 'ja'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                )}
              >
                日本語
              </button>
            </div>
          </div>

          {/* Terminal Mode */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Terminal size={16} />
              {t('settings.terminalMode', 'Terminal Mode')}
            </div>
            <label className="flex items-center justify-between p-2 rounded hover:bg-accent/50 cursor-pointer">
              <div>
                <span className="text-sm">{t('settings.ptyMode', 'PTY Terminal (xterm.js)')}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('settings.ptyModeDesc', 'Real terminal output with full CLI experience. Disable to use legacy chat-style view.')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={usePtyMode}
                onChange={(e) => setUsePtyMode(e.target.checked)}
                className="rounded"
              />
            </label>
          </div>

          {/* Terminal Font Size */}
          <div>
            <div className="flex items-center justify-between text-sm font-medium mb-2">
              <span>{t('settings.fontSize', 'Font Size')}</span>
              <span className="text-xs text-muted-foreground font-mono">{terminalFontSize}px</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">9</span>
              <input
                type="range"
                min={9}
                max={24}
                value={terminalFontSize}
                onChange={(e) => setTerminalFontSize(parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-muted-foreground">24</span>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Bell size={16} />
              {t('settings.notifications')}
            </div>
            <div className="space-y-2">
              {[
                { key: 'enabled', label: t('settings.notificationSettings.enabled') },
                { key: 'sound', label: t('settings.notificationSettings.sound') },
                { key: 'taskComplete', label: t('settings.notificationSettings.taskComplete') },
                { key: 'approvalRequired', label: t('settings.notificationSettings.approvalRequired') },
                { key: 'errors', label: t('settings.notificationSettings.errors') }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between p-2 rounded hover:bg-accent/50 cursor-pointer">
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={notifications[key]}
                    onChange={(e) => updateNotification(key, e.target.checked)}
                    className="rounded"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Data Management */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Database size={16} />
              Data
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const path = await window.api.exportDatabase()
                    if (path) showToast(t('toast.backupSaved', 'Backup saved to {{path}}', { path }), 'success')
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : String(err), 'error')
                  }
                }}
                className="flex-1 py-2 px-3 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
              >
                Export Backup
              </button>
              <button
                onClick={async () => {
                  const dbPath = await window.api.getDatabasePath()
                  const parts = dbPath.replace(/\\/g, '/').split('/')
                  parts.pop()
                  showToast(t('toast.dataLocation', 'Data: {{path}}', { path: parts.join('/') }), 'info')
                }}
                className="flex items-center gap-1 py-2 px-3 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
              >
                <FolderOpen size={12} />
                Data Location
              </button>
            </div>
          </div>

          {/* Diagnostics */}
          <div>
            <DiagnosticsPanel />
          </div>

          {/* B-2 to B-4: Config Panel */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Settings2 size={16} />
              {t('settings.advanced', 'Advanced Configuration')}
            </div>
            <div className="border border-border rounded-lg overflow-hidden h-[240px]">
              <ConfigPanel />
            </div>
          </div>

          {/* Version */}
          <div className="text-center text-[10px] text-muted-foreground/50 pt-2 border-t border-border/30">
            Claude Code Desktop v{appVersion || '0.0.0'}
          </div>
        </div>
      </div>
    </div>
  )
}
