import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceConfigData } from '@shared/types'
import { cn } from '@lib/utils'
import {
  Server,
  Sparkles,
  Terminal,
  FileText,
  HeartPulse,
  AlertTriangle
} from 'lucide-react'

interface WorkspaceConfigCardProps {
  workspacePath: string
}

export function WorkspaceConfigCard({ workspacePath }: WorkspaceConfigCardProps): JSX.Element {
  const { t } = useTranslation()
  const [config, setConfig] = useState<WorkspaceConfigData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api
      .getWorkspaceConfig(workspacePath)
      .then((data) => {
        if (!cancelled) setConfig(data)
      })
      .catch(() => {
        if (!cancelled) setConfig(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspacePath])

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-3" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs text-muted-foreground">{t('workspaceConfig.noConfig')}</p>
      </div>
    )
  }

  const isHealthy = config.healthStatus === 'healthy'

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('workspaceConfig.title')}</h3>
        <div
          className="relative group"
          role="status"
          aria-label={isHealthy ? t('workspaceConfig.healthy') : t('workspaceConfig.warning')}
        >
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              isHealthy
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-yellow-500/10 text-yellow-500'
            )}
          >
            {isHealthy ? (
              <HeartPulse size={10} />
            ) : (
              <AlertTriangle size={10} />
            )}
            {isHealthy ? t('workspaceConfig.healthy') : t('workspaceConfig.warning')}
          </span>
          {/* Issues tooltip */}
          {config.healthIssues.length > 0 && (
            <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block bg-popover border border-border rounded-md shadow-lg p-2 min-w-[200px]">
              <ul className="space-y-1">
                {config.healthIssues.map((issue, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* MCP Servers */}
      {config.mcpServers.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Server size={12} />
            <span>{t('workspaceConfig.mcpServers')}</span>
          </div>
          <ul className="space-y-1">
            {config.mcpServers.map((server) => (
              <li key={server.name} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    server.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
                <span className="truncate">{server.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills */}
      {config.skills.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles size={12} />
            <span>{t('workspaceConfig.skills')}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {config.skills.map((skill) => (
              <span
                key={skill.name}
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
              >
                {skill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Commands */}
      {config.commands.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Terminal size={12} />
            <span>{t('workspaceConfig.commands')}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {config.commands.map((cmd) => (
              <span
                key={cmd.name}
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
              >
                {cmd.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      {config.templates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText size={12} />
            <span>{t('workspaceConfig.templates')}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {config.templates.map((tpl) => (
              <span
                key={tpl.name}
                className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
              >
                {tpl.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
