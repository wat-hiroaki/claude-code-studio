import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { cn } from '@lib/utils'
import {
  ChevronUp,
  FlaskConical,
  Hammer,
  Send,
  Paperclip,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import type { PromptTemplate } from '@shared/types'

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

interface TerminalToolbarProps {
  agentId: string
}

export function TerminalToolbar({ agentId }: TerminalToolbarProps): JSX.Element {
  const { t } = useTranslation()
  const { templates, addTemplate, updateTemplate: storeUpdateTemplate, removeTemplate, planModeAgents, togglePlanMode } = useAppStore()
  const isPlanMode = planModeAgents[agentId] === true
  const [showTemplates, setShowTemplates] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [value, setValue] = useState('')
  const [templateFilter, setTemplateFilter] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formCategory, setFormCategory] = useState('custom')
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (sendTimerRef.current) clearTimeout(sendTimerRef.current) }
  }, [])

  const allTemplates = useMemo(() => {
    const merged = [...BUILTIN_TEMPLATES, ...templates]
    if (!templateFilter.trim()) return merged
    const q = templateFilter.toLowerCase()
    return merged.filter(t => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
  }, [templates, templateFilter])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return

    const planPrefix = useAppStore.getState().planModeAgents[agentId] === true
      ? '[PLAN MODE] Do NOT modify any files. Only investigate, analyze, and propose a plan.\n\n'
      : ''
    const withFiles = attachedFiles.length > 0
      ? `Files: ${attachedFiles.join(', ')}\n\n${trimmed}`
      : trimmed

    window.api.ptyWrite(agentId, planPrefix + withFiles)
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    sendTimerRef.current = setTimeout(() => {
      sendTimerRef.current = null
      window.api.ptyWrite(agentId, '\r')
    }, 50)
    setValue('')
    setAttachedFiles([])
    setShowInput(false)
  }, [agentId, value, attachedFiles])

  const handleTemplate = useCallback((tmpl: PromptTemplate) => {
    // Send template directly to PTY
    window.api.ptyWrite(agentId, tmpl.value)
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current)
    sendTimerRef.current = setTimeout(() => {
      sendTimerRef.current = null
      window.api.ptyWrite(agentId, '\r')
    }, 50)
    setShowTemplates(false)
  }, [agentId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape') {
      setShowInput(false)
      setValue('')
    }
  }, [handleSend])

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

  // Focus input when shown
  useEffect(() => {
    if (showInput) inputRef.current?.focus()
  }, [showInput])

  const handleCreateTemplate = useCallback(async () => {
    if (!formLabel.trim() || !formValue.trim()) return
    try {
      const created = await window.api.createTemplate({ label: formLabel.trim(), value: formValue.trim(), category: formCategory })
      addTemplate(created)
      setFormLabel(''); setFormValue(''); setFormCategory('custom'); setShowCreateForm(false)
    } catch (err) { console.error('Failed to create template:', err) }
  }, [formLabel, formValue, formCategory, addTemplate])

  const handleUpdateTemplate = useCallback(async () => {
    if (!editingTemplate || !formLabel.trim() || !formValue.trim()) return
    try {
      const updated = await window.api.updateTemplate(editingTemplate.id, { label: formLabel.trim(), value: formValue.trim(), category: formCategory })
      storeUpdateTemplate(editingTemplate.id, updated)
      setEditingTemplate(null); setFormLabel(''); setFormValue(''); setFormCategory('custom')
    } catch (err) { console.error('Failed to update template:', err) }
  }, [editingTemplate, formLabel, formValue, formCategory, storeUpdateTemplate])

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
      className="border-t border-border/30 bg-card/50"
      onDragOver={(e) => { e.preventDefault() }}
      onDrop={(e) => {
        e.preventDefault()
        const files = Array.from(e.dataTransfer.files)
        const paths = files.map((f) => (f as unknown as { path?: string }).path).filter(Boolean) as string[]
        if (paths.length > 0) {
          setAttachedFiles((prev) => [...new Set([...prev, ...paths])])
          setShowInput(true)
        }
      }}
    >
      {/* Expanded input (optional — for multi-word messages with attachments) */}
      {showInput && (
        <div className="px-2 pt-2 space-y-1">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {attachedFiles.map((fp) => {
                const name = fp.split(/[\\/]/).pop() ?? fp
                return (
                  <div key={fp} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">
                    <Paperclip size={9} />
                    <span className="max-w-[120px] truncate" title={fp}>{name}</span>
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((p) => p !== fp))} className="hover:text-destructive"><X size={9} /></button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('composer.placeholder', 'Type a message... (Enter to send)')}
              className="flex-1 px-3 py-1.5 text-sm bg-background/50 border border-border/50 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className={cn(
                'px-2 py-1.5 rounded-md transition-colors',
                value.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground/30'
              )}
            >
              <Send size={14} />
            </button>
            <button
              onClick={() => { setShowInput(false); setValue(''); setAttachedFiles([]) }}
              className="px-1.5 py-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Compact toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground/60">
        {/* Quick message button */}
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/50 hover:text-muted-foreground transition-colors"
            title={t('composer.quickMessage', 'Quick message (with templates/attachments)')}
          >
            <Send size={10} />
            <span>Message</span>
          </button>
        )}

        <span className="text-muted-foreground/30">·</span>

        {/* Plan Mode */}
        <button
          onClick={() => togglePlanMode(agentId)}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
            isPlanMode
              ? 'bg-amber-500/15 text-amber-500'
              : 'hover:bg-accent/50 hover:text-muted-foreground'
          )}
          title={isPlanMode ? t('composer.planModeOn', 'Plan Mode ON') : t('composer.planModeOff', 'Switch to Plan Mode')}
        >
          {isPlanMode ? <><FlaskConical size={10} /> Plan</> : <><Hammer size={10} /> Exec</>}
        </button>

        <span className="text-muted-foreground/30">·</span>

        {/* Attach file */}
        <button
          onClick={async () => {
            const file = await window.api.selectFile()
            if (file) {
              setAttachedFiles((prev) => [...new Set([...prev, file])])
              setShowInput(true)
            }
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/50 hover:text-muted-foreground transition-colors"
          title={t('composer.attach', 'Attach file')}
        >
          <Paperclip size={10} />
        </button>

        {/* Templates — right aligned */}
        <div className="relative ml-auto" ref={templatesRef}>
          <button
            onClick={() => { setShowTemplates((v) => !v); setShowCreateForm(false); setEditingTemplate(null) }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/50 hover:text-muted-foreground transition-colors"
          >
            <ChevronUp size={10} />
            <span>Templates</span>
          </button>
          {showTemplates && (
            <div className="absolute bottom-full right-0 mb-1 w-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
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
              <div className="max-h-[240px] overflow-y-auto">
                {allTemplates.map((tmpl) => (
                  <div key={tmpl.id} className="group flex items-center gap-1 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                    <button
                      onClick={() => handleTemplate(tmpl)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <span className={cn('text-[9px] px-1 py-0.5 rounded shrink-0', categoryBadge(tmpl.category))}>{tmpl.category}</span>
                      <span className="truncate">{tmpl.label}</span>
                    </button>
                    {!tmpl.isBuiltIn && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingTemplate(tmpl); setFormLabel(tmpl.label); setFormValue(tmpl.value); setFormCategory(tmpl.category); setShowCreateForm(false) }}
                          className="p-0.5 rounded hover:bg-accent" title="Edit"
                        ><Pencil size={10} /></button>
                        <button
                          onClick={async (e) => { e.stopPropagation(); await window.api.deleteTemplate(tmpl.id); removeTemplate(tmpl.id) }}
                          className="p-0.5 rounded hover:bg-destructive/20 text-destructive" title="Delete"
                        ><Trash2 size={10} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {(showCreateForm || editingTemplate) ? (
                <div className="border-t border-border p-2 space-y-1.5">
                  <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="Template name"
                    className="w-full text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <textarea value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="Template content..." rows={3}
                    className="w-full text-xs px-2 py-1 rounded border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <div className="flex items-center gap-2">
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-border bg-background">
                      <option value="custom">Custom</option>
                      <option value="dev">Dev</option>
                      <option value="review">Review</option>
                      <option value="git">Git</option>
                      <option value="info">Info</option>
                    </select>
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => { setShowCreateForm(false); setEditingTemplate(null) }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-accent">Cancel</button>
                      <button onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                        disabled={!formLabel.trim() || !formValue.trim()}
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
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
