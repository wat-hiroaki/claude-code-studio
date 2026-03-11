import { useState, useEffect, useRef, useCallback } from 'react'
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
  X
} from 'lucide-react'
import type { Message } from '@shared/types'

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
      <div className="flex items-start gap-1.5 py-1 text-red-500 dark:text-red-400">
        <span className="text-muted-foreground/40 text-[11px] mr-1 select-none shrink-0">{time}</span>
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        <span className="text-xs whitespace-pre-wrap break-words">{message.content}</span>
      </div>
    )
  }

  // User input (manager)
  if (isManager) {
    return (
      <div className="py-1">
        <span className="text-muted-foreground/40 text-[11px] mr-2 select-none">{time}</span>
        <span className="text-green-600 dark:text-green-400 font-medium text-xs select-none">{'> '}</span>
        <span className="text-green-600 dark:text-green-400 text-xs">{message.content}</span>
      </div>
    )
  }

  // Tool execution — collapsible
  if (isTool || isToolExec) {
    const lines = message.content.split('\n')
    const header = lines[0] || 'Tool'
    const body = lines.slice(1).join('\n')
    const isLong = body.length > 150

    return (
      <div className="py-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
        >
          <span className="text-muted-foreground/40 mr-1 select-none">{time}</span>
          <Terminal size={10} />
          <ChevronRight size={10} className={cn('transition-transform', expanded && 'rotate-90')} />
          <span className="font-mono">{header}</span>
        </button>
        {(expanded || !isLong) && body && (
          <pre className="ml-[72px] text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto py-1">
            {body}
          </pre>
        )}
      </div>
    )
  }

  // Agent response
  return (
    <div className="py-1">
      <span className="text-muted-foreground/40 text-[11px] mr-2 select-none">{time}</span>
      {message.contentType === 'code' || message.contentType === 'diff' ? (
        <pre className="inline text-xs font-mono whitespace-pre-wrap break-words">
          {message.contentType === 'diff'
            ? message.content.split('\n').map((line, i) => (
                <span
                  key={i}
                  className={cn(
                    'block',
                    line.startsWith('+') && 'text-green-700 dark:text-green-400',
                    line.startsWith('-') && 'text-red-700 dark:text-red-400',
                    line.startsWith('@@') && 'text-blue-700 dark:text-blue-400'
                  )}
                >
                  {line}
                </span>
              ))
            : <code>{message.content}</code>
          }
        </pre>
      ) : (
        <span className="text-xs whitespace-pre-wrap break-words">{message.content}</span>
      )}
    </div>
  )
}

export function TerminalView({ agentId, onClose, compact }: TerminalViewProps): JSX.Element {
  const { t } = useTranslation()
  const { agents, messages, setMessages, addMessage } = useAppStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const agent = agents.find((a) => a.id === agentId)
  const agentMessages = messages[agentId] || []

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
      showToast('Send Failed', err instanceof Error ? err.message : 'Failed to send', 'error')
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
    <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa] dark:bg-[#0d0d1a]">
      {/* Terminal Header */}
      <div className={cn(
        'flex items-center justify-between border-b border-border bg-card/80',
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={compact ? 12 : 14} className="text-muted-foreground shrink-0" />
          <span className={cn('font-mono font-medium truncate', compact ? 'text-[11px]' : 'text-xs')}>
            {agent.name}
          </span>
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px] shrink-0',
            getStatusBadge(agent.status)
          )}>
            {t(`agent.status.${agent.status}`)}
          </span>
          {agent.currentTask && !compact && (
            <span className="text-[10px] text-muted-foreground truncate">
              — {agent.currentTask}
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

      {/* Input */}
      <div className={cn(
        'border-t border-border bg-card/80',
        compact ? 'p-1.5' : 'p-2'
      )}>
        <div className="flex items-center gap-1.5">
          <span className="text-green-600 dark:text-green-400 text-xs font-mono select-none shrink-0">{'>'}</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={compact ? '...' : t('chat.placeholder')}
            className={cn(
              'flex-1 bg-transparent outline-none font-mono placeholder:text-muted-foreground/30',
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
