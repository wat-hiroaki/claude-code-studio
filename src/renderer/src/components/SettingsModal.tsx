import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { X, Moon, Sun, Globe, Bell } from 'lucide-react'
import { cn } from '../lib/utils'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useAppStore()

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

  const handleThemeChange = (newTheme: 'dark' | 'light'): void => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const handleLanguageChange = (lang: string): void => {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-[480px] max-h-[80vh] overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{t('settings.title')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Theme */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium mb-3">
              <Sun size={16} />
              {t('settings.theme')}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleThemeChange('light')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm border transition-colors',
                  theme === 'light'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                )}
              >
                <Sun size={14} className="inline mr-2" />
                {t('settings.themes.light')}
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-sm border transition-colors',
                  theme === 'dark'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                )}
              >
                <Moon size={14} className="inline mr-2" />
                {t('settings.themes.dark')}
              </button>
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
        </div>
      </div>
    </div>
  )
}
