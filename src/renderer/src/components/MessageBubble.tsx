import { useState } from 'react'
import type { Message } from '@shared/types'
import { cn } from '../lib/utils'
import { ChevronDown, ChevronRight, AlertCircle, Terminal } from 'lucide-react'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const isManager = message.role === 'manager'
  const isSystem = message.role === 'system'
  const isTool = message.role === 'tool'
  const isError = message.contentType === 'error'
  const isToolExec = message.contentType === 'tool_exec'

  // System messages — centered pill
  if (isSystem && !isError) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[11px] text-muted-foreground bg-secondary px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  // Error messages — red alert
  if (isError) {
    return (
      <div className="flex items-start gap-2 my-1 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg">
        <AlertCircle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
        <div className="text-xs text-destructive whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    )
  }

  // Tool execution — collapsible block
  if (isTool || isToolExec) {
    const lines = message.content.split('\n')
    const header = lines[0] || 'Tool execution'
    const body = lines.slice(1).join('\n')
    const isLong = body.length > 200

    return (
      <div className="my-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Terminal size={12} />
          <span className="font-mono">{header}</span>
        </button>
        {(expanded || !isLong) && body && (
          <pre className="mt-1 ml-5 p-2 bg-muted rounded text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words overflow-x-auto max-h-60 overflow-y-auto">
            {body}
          </pre>
        )}
      </div>
    )
  }

  // Manager / Agent messages — chat bubbles
  return (
    <div className={cn('flex', isManager ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
          isManager && 'bg-primary text-primary-foreground rounded-br-md',
          !isManager && 'bg-secondary text-secondary-foreground rounded-bl-md'
        )}
      >
        {message.contentType === 'code' ? (
          <pre className="whitespace-pre-wrap break-words overflow-x-auto font-mono text-xs">
            <code>{message.content}</code>
          </pre>
        ) : message.contentType === 'diff' ? (
          <pre className="whitespace-pre-wrap break-words overflow-x-auto font-mono text-xs">
            {message.content.split('\n').map((line, i) => (
              <span
                key={i}
                className={cn(
                  'block',
                  line.startsWith('+') && 'text-green-400',
                  line.startsWith('-') && 'text-red-400',
                  line.startsWith('@@') && 'text-blue-400'
                )}
              >
                {line}
              </span>
            ))}
          </pre>
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
        <div
          className={cn(
            'text-[10px] mt-1',
            isManager ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  )
}
