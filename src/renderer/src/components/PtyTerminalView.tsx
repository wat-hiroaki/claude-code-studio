import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { showToast } from './ToastContainer'
import { cn } from '../lib/utils'
import { getStatusBadge } from '../lib/status'
import { RotateCw, Square, Terminal, AlertCircle, Pin, PinOff } from 'lucide-react'
import { XtermTerminal } from './XtermTerminal'
import { Composer } from './Composer'
import type { Agent } from '@shared/types'

interface PtyTerminalViewProps {
  agentId: string
  compact?: boolean
}

function AgentHeader({ agent, compact }: { agent: Agent; compact: boolean }): JSX.Element {
  const { t } = useTranslation()
  const updateAgent = useAppStore((s) => s.updateAgent)

  const handleRestart = useCallback(async () => {
    try {
      await window.api.ptyStop(agent.id)
      await window.api.ptyStart(agent.id)
      showToast(t('toast.agentRestarted', 'Agent restarted'), 'success')
    } catch (err) {
      showToast(`Restart failed: ${err}`, 'error')
    }
  }, [agent.id, t])

  const handleStop = useCallback(async () => {
    try {
      await window.api.ptyStop(agent.id)
    } catch (err) {
      showToast(`Stop failed: ${err}`, 'error')
    }
  }, [agent.id])

  const handleInterrupt = useCallback(async () => {
    try {
      await window.api.ptyInterrupt(agent.id)
    } catch (err) {
      showToast(`Interrupt failed: ${err}`, 'error')
    }
  }, [agent.id])

  const togglePin = useCallback(() => {
    updateAgent(agent.id, { isPinned: !agent.isPinned })
  }, [agent.id, agent.isPinned, updateAgent])

  const statusBadge = getStatusBadge(agent.status)

  return (
    <div className={cn(
      'flex items-center justify-between border-b border-border/30 bg-card/60 backdrop-blur-sm',
      compact ? 'px-2 py-1' : 'px-3 py-2'
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <Terminal size={compact ? 12 : 14} className="text-muted-foreground shrink-0" />
        <span className={cn('font-medium truncate', compact ? 'text-xs' : 'text-sm')}>
          {agent.name}
        </span>
        {agent.roleLabel && (
          <span className="text-[10px] text-muted-foreground/70 truncate">
            {agent.roleLabel}
          </span>
        )}
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', statusBadge.className)}>
          {statusBadge.label}
        </span>
        {agent.currentTask && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">
            {agent.currentTask}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={togglePin}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title={agent.isPinned ? 'Unpin' : 'Pin'}
        >
          {agent.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button
          onClick={handleInterrupt}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-orange-400 transition-colors"
          title={t('terminal.interrupt', 'Interrupt (Ctrl+C)')}
        >
          <AlertCircle size={12} />
        </button>
        <button
          onClick={handleRestart}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-blue-400 transition-colors"
          title={t('terminal.restart', 'Restart')}
        >
          <RotateCw size={12} />
        </button>
        <button
          onClick={handleStop}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-red-400 transition-colors"
          title={t('terminal.stop', 'Stop')}
        >
          <Square size={12} />
        </button>
      </div>
    </div>
  )
}

export function PtyTerminalView({ agentId, compact = false }: PtyTerminalViewProps): JSX.Element {
  const { t } = useTranslation()
  const agent = useAppStore((s) => s.agents.find((a) => a.id === agentId))
  const theme = useAppStore((s) => s.theme)

  // Auto-start PTY session when component mounts
  useEffect(() => {
    if (!agent) return
    window.api.ptyStart(agentId).catch((err) => {
      console.error('Failed to start PTY session:', err)
    })
    return () => {
      // Don't stop on unmount — session should persist
    }
  }, [agentId, agent?.projectPath])

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground/50">
        <span className="text-sm">{t('terminal.noAgent', 'No agent selected')}</span>
      </div>
    )
  }

  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  const isInputDisabled = agent.status === 'thinking' || agent.status === 'tool_running'

  return (
    <div className="flex h-full flex-col">
      <AgentHeader agent={agent} compact={compact} />
      <div className="flex-1 min-h-0">
        <XtermTerminal
          agentId={agentId}
          theme={resolvedTheme}
          fontSize={compact ? 11 : 13}
        />
      </div>
      <Composer
        agentId={agentId}
        disabled={isInputDisabled}
      />
    </div>
  )
}
