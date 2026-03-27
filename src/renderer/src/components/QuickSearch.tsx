import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import type { Agent } from '@shared/types'
import { cn } from '@lib/utils'
import { getStatusDot, getInitials } from '@lib/status'
import { Search, Plus, LayoutDashboard, Radio, PanelRight, Zap, Link } from 'lucide-react'

interface CommandItem {
  type: 'agent' | 'action'
  id: string
  label: string
  description?: string
  agent?: Agent
  action?: () => void
  icon?: JSX.Element
}

export function QuickSearch(): JSX.Element | null {
  const { t } = useTranslation()
  const { agents, setSelectedAgent, toggleDashboard, toggleBroadcast, toggleRightPane } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build combined list: actions + agents
  const allItems = useMemo((): CommandItem[] => {
    const actions: CommandItem[] = [
      { type: 'action', id: 'new-agent', label: t('shortcuts.newAgent', 'New Agent'), description: 'Ctrl+N', icon: <Plus size={14} />, action: () => { document.dispatchEvent(new CustomEvent('app:new-agent')) } },
      { type: 'action', id: 'dashboard', label: t('shortcuts.toggleDashboard', 'Toggle Dashboard'), description: 'Ctrl+D', icon: <LayoutDashboard size={14} />, action: toggleDashboard },
      { type: 'action', id: 'broadcast', label: t('shortcuts.broadcast', 'Broadcast'), description: 'Ctrl+Shift+B', icon: <Radio size={14} />, action: toggleBroadcast },
      { type: 'action', id: 'right-pane', label: t('shortcuts.toggleRightPane', 'Toggle Right Pane'), description: 'Ctrl+Shift+P', icon: <PanelRight size={14} />, action: toggleRightPane },
      { type: 'action', id: 'session-recovery', label: t('session.recovery', 'Attach to Existing Session'), description: '', icon: <Link size={14} />, action: () => { document.dispatchEvent(new CustomEvent('app:session-recovery')) } }
    ]
    const agentItems: CommandItem[] = agents
      .filter((a) => a.status !== 'archived')
      .map((a) => ({
        type: 'agent' as const,
        id: a.id,
        label: a.name,
        description: `${a.projectName}${a.roleLabel ? ` · ${a.roleLabel}` : ''}`,
        agent: a
      }))
    return [...actions, ...agentItems]
  }, [agents, toggleDashboard, toggleBroadcast, toggleRightPane])

  const filtered = useMemo(() => {
    if (!query) return allItems
    const q = query.toLowerCase()
    return allItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false)
    )
  }, [allItems, query])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const handleSelect = (item: CommandItem): void => {
    setIsOpen(false)
    if (item.type === 'agent' && item.agent) {
      setSelectedAgent(item.agent.id)
    } else if (item.type === 'action' && item.action) {
      item.action()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.max(prev - 1, 0))
    }
    if (e.key === 'Enter' && filtered[selectedIdx]) {
      handleSelect(filtered[selectedIdx])
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50" onClick={() => setIsOpen(false)} role="dialog" aria-modal="true">
      <div
        className="bg-card border border-border rounded-xl w-[480px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('quickSearch.placeholder', 'Search agents and actions...')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {t('quickSearch.noResults', 'No results found')}
            </div>
          ) : (
            <>
              {/* Actions section */}
              {filtered.some((i) => i.type === 'action') && (
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('quickSearch.actions', 'Actions')}</span>
                </div>
              )}
              {filtered.filter((i) => i.type === 'action').map((item) => {
                const globalIdx = filtered.indexOf(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                      globalIdx === selectedIdx ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {item.icon ?? <Zap size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{item.label}</div>
                    </div>
                    {item.description && (
                      <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {item.description}
                      </kbd>
                    )}
                  </button>
                )
              })}
              {/* Agents section */}
              {filtered.some((i) => i.type === 'agent') && (
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('quickSearch.agents', 'Agents')}</span>
                </div>
              )}
              {filtered.filter((i) => i.type === 'agent').map((item) => {
                const globalIdx = filtered.indexOf(item)
                const agent = item.agent!
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      globalIdx === selectedIdx ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                        {getInitials(agent.name)}
                      </div>
                      <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', getStatusDot(agent.status))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {t(`agent.status.${agent.status}`)}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
