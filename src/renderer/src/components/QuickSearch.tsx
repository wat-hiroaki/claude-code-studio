import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import type { Agent, AgentStatus } from '@shared/types'
import { cn } from '../lib/utils'
import { Search } from 'lucide-react'

const statusColors: Record<AgentStatus, string> = {
  creating: 'bg-gray-400',
  active: 'bg-green-500',
  thinking: 'bg-blue-500',
  tool_running: 'bg-yellow-500',
  awaiting: 'bg-orange-500',
  error: 'bg-red-500',
  idle: 'bg-gray-400',
  archived: 'bg-gray-300'
}

export function QuickSearch(): JSX.Element | null {
  const { t } = useTranslation()
  const { agents, setSelectedAgent } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = agents.filter((a) => {
    const q = query.toLowerCase()
    if (!q) return true
    return (
      a.name.toLowerCase().includes(q) ||
      a.projectName.toLowerCase().includes(q) ||
      (a.roleLabel?.toLowerCase().includes(q) ?? false)
    )
  })

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

  const handleSelect = (agent: Agent): void => {
    setSelectedAgent(agent.id)
    setIsOpen(false)
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50" onClick={() => setIsOpen(false)}>
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
            placeholder={t('common.search')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No agents found
            </div>
          ) : (
            filtered.map((agent, idx) => (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  idx === selectedIdx ? 'bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {agent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', statusColors[agent.status])} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{agent.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {agent.projectName}
                    {agent.roleLabel && ` · ${agent.roleLabel}`}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t(`agent.status.${agent.status}`)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
