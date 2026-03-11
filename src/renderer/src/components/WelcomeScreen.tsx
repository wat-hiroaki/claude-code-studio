import { useTranslation } from 'react-i18next'
import { Bot, Plus, Keyboard, Radio, LayoutDashboard, HardDrive } from 'lucide-react'

interface WelcomeScreenProps {
  onCreateAgent: () => void
  onOpenScanner?: () => void
}

export function WelcomeScreen({ onCreateAgent, onOpenScanner }: WelcomeScreenProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md text-center space-y-6 p-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot size={32} className="text-primary" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold">{t('app.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('app.subtitle')}</p>
        </div>

        <p className="text-sm text-muted-foreground">
          {t('welcome.description')}
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onCreateAgent}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {t('agent.new')}
          </button>
          {onOpenScanner && (
            <button
              onClick={onOpenScanner}
              className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-foreground rounded-lg hover:bg-accent transition-colors text-sm font-medium"
            >
              <HardDrive size={16} />
              {t('workspace.button')}
            </button>
          )}
        </div>

        {/* Shortcuts hint */}
        <div className="grid grid-cols-2 gap-3 pt-4 text-left">
          {[
            { icon: Plus, keys: 'Ctrl+N', label: t('welcome.shortcuts.newAgent') },
            { icon: Keyboard, keys: 'Ctrl+K', label: t('welcome.shortcuts.search') },
            { icon: LayoutDashboard, keys: 'Ctrl+D', label: t('welcome.shortcuts.dashboard') },
            { icon: Radio, keys: 'Ctrl+Shift+B', label: t('welcome.shortcuts.broadcast') }
          ].map(({ icon: Icon, keys, label }) => (
            <div key={keys} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon size={12} />
              <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">{keys}</kbd>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
