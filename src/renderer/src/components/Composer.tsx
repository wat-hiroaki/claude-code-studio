import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Send, X, ChevronDown, ChevronUp, GripHorizontal, Plus, Pencil, Trash2, Paperclip, Search, FlaskConical, Hammer, Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import type { PromptTemplate } from '@shared/types'

// Built-in templates (not stored in DB)
const BUILTIN_TEMPLATES: PromptTemplate[] = [
  { id: '__compact', label: '/compact', value: '/compact', category: 'command', isBuiltIn: true, createdAt: '' },
  { id: '__clear', label: '/clear', value: '/clear', category: 'command', isBuiltIn: true, createdAt: '' },
  { id: '__help', label: '/help', value: '/help', category: 'command', isBuiltIn: true, createdAt: '' },
  { id: '__review', label: 'Code Review', value: 'Please review the recent changes and provide feedback on code quality, potential bugs, and improvements.', category: 'review', isBuiltIn: true, createdAt: '' },
  { id: '__test', label: 'Run Tests', value: 'Run the test suite and report any failures.', category: 'dev', isBuiltIn: true, createdAt: '' },
  { id: '__build', label: 'Build & Lint', value: 'Run npm run build && npm run lint and fix any issues found.', category: 'dev', isBuiltIn: true, createdAt: '' },
  { id: '__git', label: 'Git Status', value: 'Show me the current git status and recent changes.', category: 'git', isBuiltIn: true, createdAt: '' },
  { id: '__summary', label: 'Summarize', value: 'Please summarize what you have done so far in this session.', category: 'info', isBuiltIn: true, createdAt: '' }
]

const MIN_HEIGHT = 38
const MAX_HEIGHT_NORMAL = 400
const EXPANDED_RATIO = 0.6 // 60% of viewport when expanded

interface ComposerProps {
  agentId: string
  disabled?: boolean
  className?: string
}

// Per-agent message history (persists across re-renders, max 50 entries)
const historyMap = new Map<string, string[]>()

export function Composer({ agentId, disabled = false, className }: ComposerProps): JSX.Element {
  const { t } = useTranslation()
  const { templates, addTemplate, updateTemplate: storeUpdateTemplate, removeTemplate, planModeAgents, togglePlanMode } = useAppStore()
  const isPlanMode = planModeAgents[agentId] === true
  const [value, setValue] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [customMaxHeight, setCustomMaxHeight] = useState(() => {
    const saved = localStorage.getItem('composerHeight')
    return saved ? parseInt(saved) : 0
  })
  const [isExpanded, setIsExpanded] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formCategory, setFormCategory] = useState('custom')
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [templateFilter, setTemplateFilter] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const savedDraft = useRef('')
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const expandedMaxHeight = useMemo(() => {
    return Math.floor(window.innerHeight * EXPANDED_RATIO)
  }, [])

  const effectiveMaxHeight = isExpanded
    ? expandedMaxHeight
    : (customMaxHeight > 0 ? customMaxHeight : MAX_HEIGHT_NORMAL)

  // Line & char count
  const lineCount = value ? value.split('\n').length : 0
  const charCount = value.length

  // Cleanup send timer on unmount
  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    }
  }, [])

  // Merge built-in + custom templates, filtered
  const allTemplates = useMemo(() => {
    const merged = [...BUILTIN_TEMPLATES, ...templates]
    if (!templateFilter.trim()) return merged
    const q = templateFilter.toLowerCase()
    return merged.filter(t => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
  }, [templates, templateFilter])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    // Add to history
    const history = historyMap.get(agentId) ?? []
    if (history[0] !== trimmed) {
      history.unshift(trimmed)
      if (history.length > 50) history.pop()
      historyMap.set(agentId, history)
    }
    setHistoryIndex(-1)
    savedDraft.current = ''

    // Prepend plan mode instruction if active
    const planPrefix = useAppStore.getState().planModeAgents[agentId] === true
      ? '[PLAN MODE] Do NOT modify any files. Only investigate, analyze, and propose a plan.\n\n'
      : ''

    // Prepend attached files as context
    const withFiles = attachedFiles.length > 0
      ? `Files: ${attachedFiles.join(', ')}\n\n${trimmed}`
      : trimmed
    const fullMessage = planPrefix + withFiles

    // Send text with bracketed paste to preserve line breaks, then carriage return.
    // Bracketed paste (\x1b[200~ ... \x1b[201~) tells the CLI to treat the content
    // as pasted text, preventing newlines from being interpreted as Enter (submit).
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    const pastedMessage = `\x1b[200~${fullMessage}\x1b[201~`
    window.api.ptyWrite(agentId, pastedMessage + '\r')
    setValue('')
    setAttachedFiles([])

    // Collapse expanded state after send
    if (isExpanded) setIsExpanded(false)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [agentId, value, disabled, attachedFiles, isExpanded])

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
        return
      }
      // Escape to collapse expanded mode
      if (e.key === 'Escape' && isExpanded) {
        e.preventDefault()
        setIsExpanded(false)
        return
      }
      // Up arrow — browse history (only when cursor is at the start or value is empty)
      const history = historyMap.get(agentId) ?? []
      if (e.key === 'ArrowUp' && history.length > 0) {
        const textarea = textareaRef.current
        if (textarea && (textarea.selectionStart === 0 || !value)) {
          e.preventDefault()
          if (historyIndex === -1) savedDraft.current = value
          const newIdx = Math.min(historyIndex + 1, history.length - 1)
          setHistoryIndex(newIdx)
          setValue(history[newIdx])
        }
      }
      // Down arrow — forward in history
      if (e.key === 'ArrowDown' && historyIndex >= 0) {
        const textarea = textareaRef.current
        if (textarea && (textarea.selectionStart === value.length || !value)) {
          e.preventDefault()
          const newIdx = historyIndex - 1
          setHistoryIndex(newIdx)
          setValue(newIdx < 0 ? savedDraft.current : history[newIdx])
        }
      }
    },
    [handleSend, agentId, value, historyIndex, isExpanded]
  )

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const maxH = effectiveMaxHeight

    if (isExpanded) {
      // Expanded mode — fill up to expanded max
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`
    } else if (customMaxHeight > 0) {
      // User has manually set height via drag — respect it as minimum
      // Only expand beyond custom height if content requires it
      textarea.style.height = `${customMaxHeight}px`
      if (textarea.scrollHeight > customMaxHeight) {
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`
      }
    } else {
      // No custom height — auto-expand
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`
    }
  }, [customMaxHeight, effectiveMaxHeight, isExpanded])

  // Re-calculate height when expanded state changes
  useEffect(() => {
    handleInput()
  }, [isExpanded, handleInput])

  const handleClear = useCallback(() => {
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }, [])

  const handleTemplate = useCallback((template: PromptTemplate) => {
    setValue(template.value)
    setShowTemplates(false)
    textareaRef.current?.focus()
  }, [])

  // Create new template
  const handleCreateTemplate = useCallback(async () => {
    if (!formLabel.trim() || !formValue.trim()) return
    try {
      const created = await window.api.createTemplate({
        label: formLabel.trim(),
        value: formValue.trim(),
        category: formCategory
      })
      addTemplate(created)
      setFormLabel('')
      setFormValue('')
      setFormCategory('custom')
      setShowCreateForm(false)
    } catch (err) {
      console.error('Failed to create template:', err)
    }
  }, [formLabel, formValue, formCategory, addTemplate])

  // Update existing template
  const handleUpdateTemplate = useCallback(async () => {
    if (!editingTemplate || !formLabel.trim() || !formValue.trim()) return
    try {
      const updated = await window.api.updateTemplate(editingTemplate.id, {
        label: formLabel.trim(),
        value: formValue.trim(),
        category: formCategory
      })
      storeUpdateTemplate(editingTemplate.id, updated)
      setEditingTemplate(null)
      setFormLabel('')
      setFormValue('')
      setFormCategory('custom')
    } catch (err) {
      console.error('Failed to update template:', err)
    }
  }, [editingTemplate, formLabel, formValue, formCategory, storeUpdateTemplate])

  // Delete template
  const handleDeleteTemplate = useCallback(async (id: string) => {
    try {
      await window.api.deleteTemplate(id)
      removeTemplate(id)
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
  }, [removeTemplate])

  // Start editing
  const startEdit = useCallback((tmpl: PromptTemplate) => {
    setEditingTemplate(tmpl)
    setFormLabel(tmpl.label)
    setFormValue(tmpl.value)
    setFormCategory(tmpl.category)
    setShowCreateForm(false)
  }, [])

  // Close templates on outside click
  useEffect(() => {
    if (!showTemplates) return
    const handler = (e: MouseEvent): void => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
        setShowCreateForm(false)
        setEditingTemplate(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplates])

  // Drag resize handlers
  const handleDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    if (isExpanded) return // Disable drag in expanded mode
    isDragging.current = true
    dragStartY.current = e.clientY
    const textarea = textareaRef.current
    dragStartHeight.current = textarea ? textarea.offsetHeight : (customMaxHeight > 0 ? customMaxHeight : MAX_HEIGHT_NORMAL)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [customMaxHeight, isExpanded])

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent): void => {
      if (!isDragging.current) return
      const delta = dragStartY.current - e.clientY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT_NORMAL, dragStartHeight.current + delta))
      setCustomMaxHeight(newHeight)
      if (textareaRef.current) {
        textareaRef.current.style.height = `${newHeight}px`
      }
    }

    const handleMouseUp = (): void => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Persist
      const textarea = textareaRef.current
      if (textarea) {
        const h = textarea.offsetHeight
        localStorage.setItem('composerHeight', String(h))
        window.api.updateSettings({ composerHeight: h })
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const toggleExpand = useCallback(() => {
    setIsExpanded((v) => !v)
  }, [])

  const categoryBadge = (cat: string): string => {
    switch (cat) {
      case 'command': return 'bg-blue-500/20 text-blue-400'
      case 'review': return 'bg-yellow-500/20 text-yellow-400'
      case 'git': return 'bg-green-500/20 text-green-400'
      case 'dev': return 'bg-muted text-muted-foreground'
      case 'custom': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div
      ref={composerRef}
      className={cn(
        'border-t border-border/50 bg-card/80 backdrop-blur-sm transition-all',
        isDragOver && 'ring-2 ring-primary/50 bg-primary/5',
        isExpanded && 'border-t-2 border-primary/30',
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
          const paths = files.map((f) => (f as unknown as { path?: string }).path).filter(Boolean) as string[]
          if (paths.length > 0) setAttachedFiles((prev) => [...new Set([...prev, ...paths])])
        }
      }}
    >
      {/* Drag handle for resizing */}
      <div
        className={cn(
          'flex items-center justify-center h-4 cursor-ns-resize group transition-colors',
          isExpanded ? 'bg-primary/10 cursor-default' : 'hover:bg-border/50'
        )}
        onMouseDown={handleDragStart}
        title={isExpanded ? undefined : t('composer.dragResize', 'Drag to resize')}
      >
        <GripHorizontal size={14} className={cn(
          'transition-colors',
          isExpanded ? 'text-primary/40' : 'text-muted-foreground/50 group-hover:text-muted-foreground'
        )} />
      </div>
      {/* Attached files chips */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1">
          {attachedFiles.map((fp) => {
            const name = fp.split(/[\\/]/).pop() ?? fp
            return (
              <div key={fp} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] animate-in fade-in slide-in-from-bottom-1 duration-200">
                <Paperclip size={9} />
                <span className="max-w-[120px] truncate" title={fp}>{name}</span>
                <button onClick={() => setAttachedFiles((prev) => prev.filter((p) => p !== fp))} className="hover:text-destructive"><X size={9} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2 p-2 pt-0">
        <textarea
          ref={textareaRef}
          data-composer-input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={disabled ? t('composer.waiting', 'Agent is busy...') : t('composer.placeholder', 'Type a message... (Enter to send, Shift+Enter for newline)')}
          rows={isExpanded ? 8 : 1}
          className={cn(
            'flex-1 resize-none rounded-md border px-3 py-2',
            'text-sm font-mono',
            'focus:outline-none focus:ring-1 focus:ring-primary/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'scrollbar-thin scrollbar-thumb-border',
            isExpanded
              ? 'border-primary/30 bg-background placeholder:text-muted-foreground/60'
              : 'border-border/50 bg-background/80 placeholder:text-muted-foreground/50'
          )}
          style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${effectiveMaxHeight}px` }}
        />
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            {/* Expand/Collapse toggle */}
            <button
              onClick={toggleExpand}
              className={cn(
                'flex h-[38px] w-[38px] items-center justify-center rounded-md transition-colors',
                isExpanded
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-border/50 text-muted-foreground hover:bg-muted/50'
              )}
              title={t(isExpanded ? 'composer.collapse' : 'composer.expand')}
            >
              {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            {value && (
              <button
                onClick={handleClear}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/50 transition-colors"
                title={t('composer.clear', 'Clear')}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {/* Plan Mode Toggle */}
            <button
              onClick={() => togglePlanMode(agentId)}
              className={cn(
                'flex h-[38px] items-center gap-1 px-2 rounded-md transition-colors text-[10px] font-mono',
                isPlanMode
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'border border-border/50 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
              )}
              title={isPlanMode
                ? t('composer.planModeOn', 'Plan Mode ON — files won\'t be modified')
                : t('composer.planModeOff', 'Switch to Plan Mode')
              }
            >
              {isPlanMode
                ? <><FlaskConical size={13} /> Plan</>
                : <><Hammer size={13} /> Exec</>
              }
            </button>

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
      </div>
      <div className="flex items-center gap-2 px-3 pb-1.5 text-[10px] text-muted-foreground/60">
        <span>Enter {t('composer.toSend', 'to send')}</span>
        <span>·</span>
        <span>Shift+Enter {t('composer.forNewline', 'for newline')}</span>
        {isExpanded && (
          <>
            <span>·</span>
            <span>Esc {t('composer.toCollapse', 'to collapse')}</span>
          </>
        )}
        {/* Line & char count */}
        {value && (
          <span className="ml-1 tabular-nums">
            {lineCount} {t('composer.lines', 'lines')} · {charCount} {t('composer.chars', 'chars')}
          </span>
        )}
        <div className="relative ml-auto" ref={templatesRef}>
          <button
            onClick={() => { setShowTemplates((v) => !v); setShowCreateForm(false); setEditingTemplate(null) }}
            className="flex items-center gap-1 cursor-pointer hover:text-muted-foreground/80"
          >
            {showTemplates ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            <span>{t('composer.templates', 'Templates')}</span>
          </button>
          {showTemplates && (
            <div className="absolute bottom-full right-0 mb-1 w-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              {/* Search filter */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
                <Search size={11} className="text-muted-foreground/50 shrink-0" />
                <input
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  placeholder="Search templates..."
                  className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/40"
                  autoFocus
                />
              </div>
              {/* Template list */}
              <div className="max-h-[240px] overflow-y-auto">
                {allTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="group flex items-center gap-1 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => handleTemplate(tmpl)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <span className={cn('text-[9px] px-1 py-0.5 rounded shrink-0', categoryBadge(tmpl.category))}>
                        {tmpl.category}
                      </span>
                      <span className="truncate">{tmpl.label}</span>
                    </button>
                    {!tmpl.isBuiltIn && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(tmpl) }}
                          className="p-0.5 rounded hover:bg-accent"
                          title="Edit"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id) }}
                          className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Create / Edit form */}
              {(showCreateForm || editingTemplate) ? (
                <div className="border-t border-border p-2 space-y-1.5">
                  <input
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="Template name"
                    className="w-full text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <textarea
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="Template content..."
                    rows={3}
                    className="w-full text-xs px-2 py-1 rounded border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-border bg-background"
                    >
                      <option value="custom">Custom</option>
                      <option value="dev">Dev</option>
                      <option value="review">Review</option>
                      <option value="git">Git</option>
                      <option value="info">Info</option>
                    </select>
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => { setShowCreateForm(false); setEditingTemplate(null) }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                        disabled={!formLabel.trim() || !formValue.trim()}
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {editingTemplate ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowCreateForm(true); setFormLabel(''); setFormValue(''); setFormCategory('custom') }}
                  className="w-full flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors border-t border-border"
                >
                  <Plus size={12} />
                  <span>{t('composer.addTemplate', 'New Template')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
