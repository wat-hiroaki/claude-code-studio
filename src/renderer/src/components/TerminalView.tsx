import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { showToast } from './ToastContainer'
import { cn } from '../lib/utils'
import { getStatusBadge } from '../lib/status'
import {
  Send,
  RotateCw,
  Square,
  ChevronRight,
  Terminal,
  AlertCircle,
  X,
  FileText,
  Pencil,
  FilePlus,
  Search,
  Bot,
  Zap,
  Brain
} from 'lucide-react'
import { ChangedFilesPanel } from './ChangedFilesPanel'
import type { Message, Workspace } from '@shared/types'

// ---------------------------------------------------------------------------
// Tool action parsing
// ---------------------------------------------------------------------------

interface ToolAction {
  toolName: string
  icon: typeof FileText
  label: string
  detail: string
  colorClass: string
}

function extractToolName(firstLine: string): string | null {
  const match = firstLine.match(/^\[([A-Za-z_]+)\]/)
  return match ? match[1] : null
}

function extractFilePath(body: string): string | null {
  // Try JSON-style "file_path": "..." or "path": "..."
  const jsonMatch = body.match(/"(?:file_path|path|file)":\s*"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]
  // Try plain path-like token on first non-empty body line
  const lines = body.split('\n').filter((l) => l.trim())
  if (lines.length > 0) {
    const pathMatch = lines[0].match(/([A-Za-z]:)?[/\\][\w/\\.@_-]+/)
    if (pathMatch) return pathMatch[0]
  }
  return null
}

function extractCommand(body: string): string | null {
  const jsonMatch = body.match(/"command":\s*"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]
  const lines = body.split('\n').filter((l) => l.trim())
  return lines.length > 0 ? lines[0].slice(0, 80) : null
}

function shortenPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  if (parts.length <= 3) return parts.join('/')
  return '.../' + parts.slice(-2).join('/')
}

function parseToolAction(content: string): ToolAction | null {
  const lines = content.split('\n')
  const firstLine = lines[0] || ''
  const body = lines.slice(1).join('\n')
  const toolName = extractToolName(firstLine)

  if (!toolName && !firstLine) return null

  const name = toolName || firstLine.trim()
  const lowerName = name.toLowerCase()

  if (lowerName === 'read' || lowerName.includes('read')) {
    const fp = extractFilePath(body)
    return {
      toolName: 'Read',
      icon: FileText,
      label: 'terminal.action.reading',
      detail: fp ? shortenPath(fp) : '',
      colorClass: 'text-sky-500 dark:text-sky-400'
    }
  }

  if (lowerName === 'edit') {
    const fp = extractFilePath(body)
    return {
      toolName: 'Edit',
      icon: Pencil,
      label: 'terminal.action.editing',
      detail: fp ? shortenPath(fp) : '',
      colorClass: 'text-amber-500 dark:text-amber-400'
    }
  }

  if (lowerName === 'write') {
    const fp = extractFilePath(body)
    return {
      toolName: 'Write',
      icon: FilePlus,
      label: 'terminal.action.creating',
      detail: fp ? shortenPath(fp) : '',
      colorClass: 'text-emerald-500 dark:text-emerald-400'
    }
  }

  if (lowerName === 'bash') {
    const cmd = extractCommand(body)
    return {
      toolName: 'Bash',
      icon: Terminal,
      label: 'terminal.action.running',
      detail: cmd ? cmd.slice(0, 60) + (cmd.length > 60 ? '...' : '') : '',
      colorClass: 'text-violet-500 dark:text-violet-400'
    }
  }

  if (lowerName === 'glob') {
    return {
      toolName: 'Glob',
      icon: Search,
      label: 'terminal.action.searchingFiles',
      detail: '',
      colorClass: 'text-cyan-500 dark:text-cyan-400'
    }
  }

  if (lowerName === 'grep') {
    return {
      toolName: 'Grep',
      icon: Search,
      label: 'terminal.action.searchingContent',
      detail: '',
      colorClass: 'text-cyan-500 dark:text-cyan-400'
    }
  }

  if (lowerName === 'agent') {
    return {
      toolName: 'Agent',
      icon: Bot,
      label: 'terminal.action.subAgent',
      detail: '',
      colorClass: 'text-purple-500 dark:text-purple-400'
    }
  }

  // Fallback for any other tool
  return {
    toolName: name,
    icon: Zap,
    label: 'terminal.action.tool',
    detail: name,
    colorClass: 'text-orange-500 dark:text-orange-400'
  }
}

// ---------------------------------------------------------------------------
// ActionSummary — compact colored line for a tool action
// ---------------------------------------------------------------------------

function ActionSummary({
  action,
  expanded,
  onToggle,
  time
}: {
  action: ToolAction
  expanded: boolean
  onToggle: () => void
  time: string
}): JSX.Element {
  const { t } = useTranslation()
  const Icon = action.icon

  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 text-[11px] hover:brightness-125 transition-all w-full text-left',
        action.colorClass
      )}
    >
      <span className="text-cyan-900/60 font-mono mr-0.5 select-none shrink-0">{time}</span>
      <Icon size={12} className="shrink-0 drop-shadow-[0_0_5px_currentColor]" />
      <span className="font-bold shrink-0 tracking-wide drop-shadow-[0_0_2px_currentColor]">{t(action.label)}</span>
      {action.detail && (
        <span className="font-mono text-[10px] opacity-80 truncate">{action.detail}</span>
      )}
      <ChevronRight
        size={10}
        className={cn('ml-auto shrink-0 transition-transform opacity-70', expanded && 'rotate-90')}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// CurrentActionBar — persistent status bar showing latest action
// ---------------------------------------------------------------------------

function CurrentActionBar({ messages }: { messages: Message[] }): JSX.Element | null {
  const { t } = useTranslation()

  const currentAction = useMemo(() => {
    // Walk backwards to find latest tool/thinking message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]

      // Check for thinking status
      if (msg.role === 'agent' && msg.contentType === 'text') {
        // If the latest agent message exists, the agent is done or responding
        return null
      }

      if (msg.role === 'tool' || msg.contentType === 'tool_exec') {
        const action = parseToolAction(msg.content)
        if (action) return action
      }
    }
    return null
  }, [messages])

  if (!currentAction) return null

  const Icon = currentAction.icon

  return (
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 border-b border-cyan-900/30 text-[11px]',
          'bg-[#0a0a0f]/80 backdrop-blur-sm shadow-[0_4px_20px_rgba(6,182,212,0.05)]',
          currentAction.colorClass
        )}
      >
        <Brain size={11} className="text-cyan-400/60 shrink-0 animate-pulse drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      <Icon size={11} className="shrink-0" />
      <span className="font-medium shrink-0">{t(currentAction.label)}</span>
      {currentAction.detail && (
        <span className="font-mono text-[10px] opacity-75 truncate">{currentAction.detail}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TerminalLine
// ---------------------------------------------------------------------------

interface TerminalViewProps {
  agentId: string
  onClose?: () => void
  compact?: boolean
}

function TerminalLine({ message }: { message: Message }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const isManager = message.role === 'manager'
  const isSystem = message.role === 'system'
  const isError = message.contentType === 'error'
  const isToolExec = message.contentType === 'tool_exec'
  const isTool = message.role === 'tool'

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  // System messages
  if (isSystem && !isError) {
    return (
      <div className="text-muted-foreground/60 text-[11px] py-0.5">
        <span className="text-muted-foreground/40 mr-2 select-none">{time}</span>
        <span className="italic">{message.content}</span>
      </div>
    )
  }

  // Error
  if (isError) {
    return (
      <div className="flex items-start gap-1.5 py-1 text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.6)]">
        <span className="text-cyan-900/60 text-[11px] mr-1 select-none shrink-0 font-mono">{time}</span>
        <AlertCircle size={12} className="mt-0.5 shrink-0 animate-pulse" />
        <span className="text-xs whitespace-pre-wrap break-words">{message.content}</span>
      </div>
    )
  }

  // User input (manager)
  if (isManager) {
    return (
      <div className="py-1">
        <span className="text-cyan-900/60 text-[11px] mr-2 select-none font-mono">{time}</span>
        <span className="text-emerald-400 font-bold text-xs select-none drop-shadow-[0_0_3px_rgba(52,211,153,0.8)]">{'> '}</span>
        <span className="text-emerald-400 font-medium text-xs drop-shadow-[0_0_2px_rgba(52,211,153,0.5)]">{message.content}</span>
      </div>
    )
  }

  // Tool execution — action summary + collapsible details
  if (isTool || isToolExec) {
    const lines = message.content.split('\n')
    const header = lines[0] || 'Tool'
    const body = lines.slice(1).join('\n')
    const action = parseToolAction(message.content)

    // If we successfully parsed an action, show the enhanced summary
    if (action) {
      return (
        <div className="py-0.5">
          <ActionSummary
            action={action}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            time={time}
          />
          {expanded && body && (
            <pre className="ml-[72px] text-[10px] text-cyan-700/80 whitespace-pre-wrap break-words max-h-48 overflow-y-auto py-1 border-l-2 border-cyan-800/50 pl-2 mt-0.5">
              {body}
            </pre>
          )}
        </div>
      )
    }

    // Fallback: original collapsible behavior for unrecognized tool formats
    const isLong = body.length > 150

    return (
      <div className="py-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors drop-shadow-[0_0_2px_rgba(129,140,248,0.5)]"
        >
          <span className="text-cyan-900/60 font-mono mr-1 select-none">{time}</span>
          <Terminal size={10} className="drop-shadow-[0_0_2px_currentColor]" />
          <ChevronRight size={10} className={cn('transition-transform', expanded && 'rotate-90')} />
          <span className="font-mono tracking-wide">{header}</span>
        </button>
        {(expanded || !isLong) && body && (
          <pre className="ml-[72px] text-[10px] text-cyan-700/80 whitespace-pre-wrap break-words max-h-48 overflow-y-auto py-1">
            {body}
          </pre>
        )}
      </div>
    )
  }

  // Agent response
  return (
    <div className="py-1 group">
      <span className="text-cyan-900/60 text-[11px] mr-2 select-none font-mono">{time}</span>
      {message.contentType === 'code' || message.contentType === 'diff' ? (
        <pre className="inline text-xs font-mono whitespace-pre-wrap break-words">
          {message.contentType === 'diff'
            ? message.content.split('\n').map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    'block',
                    line.startsWith('+') && 'text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.6)]',
                    line.startsWith('-') && 'text-red-400 drop-shadow-[0_0_3px_rgba(248,113,113,0.6)]',
                    line.startsWith('@@') && 'text-indigo-400 drop-shadow-[0_0_3px_rgba(129,140,248,0.6)]'
                  )}
                >
                  {line}
                </span>
              ))
            : <code className="text-cyan-200/90 drop-shadow-[0_0_2px_rgba(165,243,252,0.4)]">{message.content}</code>
          }
        </pre>
      ) : (
        <span className="text-xs whitespace-pre-wrap break-words text-cyan-200/90 drop-shadow-[0_0_2px_rgba(165,243,252,0.4)]">{message.content}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TerminalView
// ---------------------------------------------------------------------------

export function TerminalView({ agentId, onClose, compact }: TerminalViewProps): JSX.Element {
  const { t } = useTranslation()
  const { agents, messages, setMessages, addMessage } = useAppStore()
  const [input, setInput] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const agent = agents.find((a) => a.id === agentId)
  const agentMessages = messages[agentId] || []

  // Fetch workspace info
  useEffect(() => {
    if (!agent?.workspaceId) { setWorkspace(null); return }
    window.api.getWorkspaces().then((wsList) => {
      setWorkspace(wsList.find((w) => w.id === agent.workspaceId) ?? null)
    })
  }, [agent?.workspaceId])

  const loadMessages = useCallback(async () => {
    const msgs = await window.api.getMessages(agentId)
    setMessages(agentId, msgs)
  }, [agentId, setMessages])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agentMessages.length])

  const handleSend = async (): Promise<void> => {
    if (!input.trim()) return
    const content = input.trim()
    setInput('')

    addMessage(agentId, {
      id: Date.now(),
      agentId,
      role: 'manager',
      contentType: 'text',
      content,
      metadata: null,
      createdAt: new Date().toISOString()
    })

    try {
      await window.api.sendMessage(agentId, content)
    } catch (err) {
      showToast(t('toast.sendFailed', 'Send Failed'), err instanceof Error ? err.message : t('toast.sendFailedDetail', 'Failed to send'), 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-[#1a1a2e] dark:bg-[#0d0d1a]">
        <p className="text-sm">{t('chat.selectAgent')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#050505] text-cyan-500 font-mono tracking-wide relative">
      {/* Matrix Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-50 opacity-10 mix-blend-screen"></div>

      {/* Terminal Header */}
      <div className={cn(
        'flex items-center justify-between border-b border-cyan-900/50 bg-[#0a0a0f]/90 backdrop-blur-md z-10',
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={compact ? 12 : 14} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)] shrink-0" />
          <span className={cn('font-mono font-bold text-cyan-300 drop-shadow-[0_0_4px_rgba(103,232,249,0.5)] truncate uppercase', compact ? 'text-[11px]' : 'text-xs')}>
            {agent.name}
          </span>
          {agent.roleLabel && (
            <span className="text-[10px] text-muted-foreground/70 truncate">
              {agent.roleLabel}
            </span>
          )}
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px] shrink-0',
            getStatusBadge(agent.status).className
          )}>
            {t(`agent.status.${agent.status}`)}
          </span>
          {agent.currentTask && !compact && (
            <span className="text-[10px] text-muted-foreground truncate">
              — {agent.currentTask}
            </span>
          )}
          {workspace && !compact && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 shrink-0 truncate max-w-[120px]">
              {workspace.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => window.api.interruptAgent(agent.id)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title={t('agent.actions.interrupt')}
          >
            <Square size={compact ? 10 : 12} />
          </button>
          <button
            onClick={() => window.api.restartAgent(agent.id)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title={t('agent.actions.restart')}
          >
            <RotateCw size={compact ? 10 : 12} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
            >
              <X size={compact ? 10 : 12} />
            </button>
          )}
        </div>
      </div>

      {/* Current Action Status Bar */}
      {agent.status === 'tool_running' && (
        <CurrentActionBar messages={agentMessages} />
      )}

      {/* Terminal Output */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto font-mono',
          compact ? 'px-2 py-1' : 'px-3 py-2'
        )}
      >
        {agentMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
            {t('chat.noMessages')}
          </div>
        ) : (
          agentMessages.map((msg) => (
            <TerminalLine key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Changed Files */}
      {!compact && <ChangedFilesPanel agentId={agentId} />}

      {/* Input */}
      <div className={cn(
        'border-t border-cyan-900/50 bg-[#0a0a0f]/90 backdrop-blur-md z-10',
        compact ? 'p-1.5' : 'p-2'
      )}>
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-400 text-xs font-mono font-bold select-none shrink-0 drop-shadow-[0_0_3px_rgba(52,211,153,0.6)]">{'>'}</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={compact ? '...' : t('chat.placeholder')}
            className={cn(
              'flex-1 bg-transparent border-none outline-none font-mono text-cyan-300 placeholder:text-cyan-900/50 caret-cyan-400 drop-shadow-[0_0_2px_rgba(103,232,249,0.3)]',
              compact ? 'text-[11px]' : 'text-xs'
            )}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-1 rounded text-primary hover:text-primary/80 disabled:opacity-30 transition-colors"
          >
            <Send size={compact ? 10 : 12} />
          </button>
        </div>
      </div>
    </div>
  )
}
