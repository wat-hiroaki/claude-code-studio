import { useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { showToast } from '@components/ToastContainer'
import { cn } from '@lib/utils'
import { getStatusBadge } from '@lib/status'
import { RotateCw, Square, Terminal, AlertCircle, Pin, PinOff, Server, Link, Eraser } from 'lucide-react'
import { XtermTerminal } from '@components/XtermTerminal'
import { TerminalToolbar } from '@components/TerminalToolbar'
import { SessionRecoveryDialog } from '@components/SessionRecoveryDialog'
import type { Agent, Workspace } from '@shared/types'

interface PtyTerminalViewProps {
  agentId: string
  compact?: boolean
}

function AgentHeader({ agent, compact, workspace, onRecoverSession }: { agent: Agent; compact: boolean; workspace: Workspace | null; onRecoverSession: () => void }): JSX.Element {
  const { t } = useTranslation()
  const updateAgentInList = useAppStore((s) => s.updateAgentInList)

  const handleRestart = useCallback(async () => {
    try {
      await window.api.ptyStop(agent.id)
      await window.api.ptyStart(agent.id)
      showToast(t('toast.agentRestarted', 'Agent restarted'), 'success')
    } catch (err) {
      showToast(t('toast.restartFailed', 'Restart failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }, [agent.id, t])

  const handleStop = useCallback(async () => {
    try {
      await window.api.ptyStop(agent.id)
    } catch (err) {
      showToast(t('toast.stopFailed', 'Stop failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }, [agent.id, t])

  const handleInterrupt = useCallback(async () => {
    try {
      await window.api.ptyInterrupt(agent.id)
    } catch (err) {
      showToast(t('toast.interruptFailed', 'Interrupt failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }, [agent.id, t])

  const handleClear = useCallback(() => {
    document.dispatchEvent(new CustomEvent('xterm:clear', { detail: { agentId: agent.id } }))
  }, [agent.id])

  const togglePin = useCallback(async () => {
    await window.api.updateAgent(agent.id, { isPinned: !agent.isPinned })
    updateAgentInList(agent.id, { isPinned: !agent.isPinned })
  }, [agent.id, agent.isPinned, updateAgentInList])

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
          {t(`agent.status.${agent.status}`)}
        </span>
        {workspace?.connectionType === 'ssh' && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-500">
            <Server size={9} />
            SSH
          </span>
        )}
        {workspace && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 shrink-0 truncate max-w-[120px]">
            {workspace.name}
          </span>
        )}
        {agent.currentTask && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">
            {agent.currentTask}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleClear}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-foreground transition-colors"
          title={t('terminal.clear', 'Clear terminal')}
        >
          <Eraser size={12} />
        </button>
        <button
          onClick={onRecoverSession}
          className="p-1 rounded hover:bg-muted/50 text-muted-foreground/60 hover:text-cyan-400 transition-colors"
          title={t('session.recovery', 'Attach to existing session')}
        >
          <Link size={12} />
        </button>
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
  const terminalFontSize = useAppStore((s) => s.terminalFontSize)
  const [sessionExited, setSessionExited] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)

  // Load workspace info for SSH badge
  useEffect(() => {
    if (!agent?.workspaceId) {
      setWorkspace(null)
      return
    }
    window.api.getWorkspaces().then((wsList) => {
      setWorkspace(wsList.find((w) => w.id === agent.workspaceId) ?? null)
    })
  }, [agent?.workspaceId])

  // Auto-start PTY session when component mounts
  useEffect(() => {
    if (!agent) return
    setSessionExited(false)
    setExitCode(null)
    window.api.ptyStart(agentId).catch((err) => {
      console.error('Failed to start PTY session:', err)
    })

    const unsub = window.api.onPtyExit((id, code) => {
      if (id === agentId) {
        setSessionExited(true)
        setExitCode(code)
      }
    })
    return () => {
      unsub()
      // Do NOT call ptyStop here — session should persist when switching views
      // ptyStop is only called explicitly via stop button or agent archive
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

  // Only disable input when the session has exited.
  // During thinking/tool_running, the user should still be able to type
  // (same as interacting directly with the terminal).
  const isInputDisabled = sessionExited

  const handleRestartSession = useCallback(async () => {
    setSessionExited(false)
    setExitCode(null)
    try {
      await window.api.ptyStart(agentId)
    } catch (err) {
      showToast(t('toast.restartFailed', 'Failed to restart: {{error}}', { error: err instanceof Error ? err.message : String(err) }), 'error')
    }
  }, [agentId, t])

  return (
    <div className="flex h-full flex-col">
      <AgentHeader agent={agent} compact={compact} workspace={workspace} onRecoverSession={() => setShowRecovery(true)} />
      <div className="flex-1 min-h-0">
        <XtermTerminal
          agentId={agentId}
          theme={resolvedTheme}
          fontSize={compact ? Math.max(terminalFontSize - 2, 9) : terminalFontSize}
        />
      </div>
      {sessionExited && (
        <div className={cn(
          'flex items-center justify-between px-3 py-2 text-xs',
          exitCode === 0 ? 'bg-muted/50' : 'bg-red-500/10'
        )}>
          <span className={exitCode === 0 ? 'text-muted-foreground' : 'text-red-400'}>
            {exitCode === 0 ? t('terminal.exited', 'Session ended') : t('terminal.exitedError', `Session exited with code ${exitCode}`)}
          </span>
          <button
            onClick={handleRestartSession}
            className="flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
          >
            <RotateCw size={10} />
            <span>{t('terminal.restartSession', 'Restart')}</span>
          </button>
        </div>
      )}
      <TerminalToolbar agentId={agentId} />
      {showRecovery && agent && (
        <SessionRecoveryDialog
          agentId={agentId}
          projectPath={agent.projectPath}
          onClose={() => setShowRecovery(false)}
          onAttached={() => {
            setShowRecovery(false)
            handleRestartSession()
          }}
        />
      )}
    </div>
  )
}
