import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { Send, X, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface ComposerProps {
  agentId: string
  disabled?: boolean
  className?: string
}

export function Composer({ agentId, disabled = false, className }: ComposerProps): JSX.Element {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    // Send to PTY stdin with newline
    window.api.ptyWrite(agentId, trimmed + '\n')
    setValue('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [agentId, value, disabled])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
        return
      }
      // Enter without modifiers also sends (Shift+Enter for newline)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    // Auto-expand height
    textarea.style.height = 'auto'
    const maxHeight = 200 // ~8 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  const handleClear = useCallback(() => {
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }, [])

  return (
    <div className={cn('border-t border-border/50 bg-card/80 backdrop-blur-sm', className)}>
      <div className="flex items-end gap-2 p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={disabled ? t('composer.waiting', 'Agent is busy...') : t('composer.placeholder', 'Type a message... (Enter to send, Shift+Enter for newline)')}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border border-border/50 bg-background/50 px-3 py-2',
            'text-sm font-mono placeholder:text-muted-foreground/50',
            'focus:outline-none focus:ring-1 focus:ring-primary/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'scrollbar-thin scrollbar-thumb-border'
          )}
          style={{ minHeight: '38px', maxHeight: '200px' }}
        />
        <div className="flex gap-1">
          {value && (
            <button
              onClick={handleClear}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/50 transition-colors"
              title={t('composer.clear', 'Clear')}
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className={cn(
              'flex h-[38px] w-[38px] items-center justify-center rounded-md transition-colors',
              value.trim() && !disabled
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border border-border/50 text-muted-foreground/50 cursor-not-allowed'
            )}
            title={t('composer.send', 'Send (Ctrl+Enter)')}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 pb-1.5 text-[10px] text-muted-foreground/60">
        <span>Enter {t('composer.toSend', 'to send')}</span>
        <span>·</span>
        <span>Shift+Enter {t('composer.forNewline', 'for newline')}</span>
        <span className="ml-auto flex items-center gap-1 cursor-pointer hover:text-muted-foreground/80">
          <ChevronDown size={10} />
          <span>Templates</span>
        </span>
      </div>
    </div>
  )
}
