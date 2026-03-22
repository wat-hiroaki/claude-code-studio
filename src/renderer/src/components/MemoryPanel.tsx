import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { showToast } from '@components/ToastContainer'
import {
  Save,
  Search,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Copy,
  Clock
} from 'lucide-react'
import { cn } from '@lib/utils'
import type { AureliusSession } from '@shared/types'

export function MemoryPanel(): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, agents } = useAppStore()
  const agent = agents.find(a => a.id === selectedAgentId)

  const [sessions, setSessions] = useState<AureliusSession[]>([])
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Save form state
  const [summary, setSummary] = useState('')
  const [decisions, setDecisions] = useState('')
  const [nextSteps, setNextSteps] = useState('')

  // Check availability and load sessions
  useEffect(() => {
    window.api.aureliusAvailable().then(setAvailable).catch(() => setAvailable(false))
  }, [])

  const loadSessions = useCallback(async () => {
    if (!available) return
    setLoading(true)
    try {
      const project = agent?.name || agent?.projectName
      const result = await window.api.aureliusGetSessions(project, 20)
      setSessions(result)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [available, agent?.projectName])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleSave = async (): Promise<void> => {
    if (!summary.trim() || !agent) return
    try {
      await window.api.aureliusSaveSession({
        summary: summary.trim(),
        project: agent.name,
        decisions: decisions.trim() ? decisions.split('\n').filter(Boolean) : undefined,
        nextSteps: nextSteps.trim() ? nextSteps.split('\n').filter(Boolean) : undefined
      })
      showToast(t('memory.saved', 'Session saved to memory'), 'success')
      setSummary('')
      setDecisions('')
      setNextSteps('')
      setShowSaveForm(false)
      loadSessions()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handleRestore = async (session: AureliusSession): Promise<void> => {
    if (!selectedAgentId) {
      showToast('No agent selected', 'warning')
      return
    }

    // Build context and send as message to the agent
    const parts: string[] = ['Вот контекст из прошлой сессии, используй его:']
    if (session.note) parts.push(`Сессия: ${session.note}`)
    if (session.data?.decisions?.length) {
      parts.push(`Решения: ${session.data.decisions.join('; ')}`)
    }
    if (session.data?.next_steps?.length) {
      parts.push(`Следующие шаги: ${session.data.next_steps.join('; ')}`)
    }
    if (session.data?.problems_solved?.length) {
      parts.push(`Решённые проблемы: ${session.data.problems_solved.map(p => `${p.problem} → ${p.solution}`).join('; ')}`)
    }

    try {
      await window.api.ptyWrite(selectedAgentId, parts.join('\n') + '\n')
      showToast(t('memory.restored', 'Session context sent to agent'), 'success')
    } catch {
      showToast('Failed to send to agent', 'error')
    }
  }

  const handleSearch = async (): Promise<void> => {
    if (!searchQuery.trim()) {
      loadSessions()
      return
    }
    setLoading(true)
    try {
      const results = await window.api.aureliusSearch(searchQuery, 'session')
      setSessions(results.map(r => ({
        id: r.id,
        label: r.label,
        note: r.note || '',
        data: r.data as AureliusSession['data'],
        created_at: r.created_at
      })))
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!available) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-xs text-muted-foreground">
          <p className="mb-2">Aurelius not found</p>
          <p className="text-[10px]">Install from github.com/Blysspeak/aurelius</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with save button */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('memory.title', 'Memory')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadSessions()}
            className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
            title={t('common.refresh', 'Refresh')}
          >
            <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowSaveForm(v => !v)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors',
              showSaveForm
                ? 'bg-primary text-primary-foreground'
                : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
            )}
          >
            <Save size={11} />
            {t('memory.save', 'Save')}
          </button>
        </div>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="p-3 border-b border-border space-y-2 bg-secondary/30">
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder={t('memory.summaryPlaceholder', 'What was accomplished...')}
            className="w-full px-2 py-1.5 text-[11px] bg-secondary rounded border-none outline-none resize-none placeholder:text-muted-foreground"
            rows={2}
          />
          <textarea
            value={decisions}
            onChange={e => setDecisions(e.target.value)}
            placeholder={t('memory.decisionsPlaceholder', 'Decisions (one per line)...')}
            className="w-full px-2 py-1.5 text-[11px] bg-secondary rounded border-none outline-none resize-none placeholder:text-muted-foreground"
            rows={2}
          />
          <textarea
            value={nextSteps}
            onChange={e => setNextSteps(e.target.value)}
            placeholder={t('memory.nextStepsPlaceholder', 'Next steps (one per line)...')}
            className="w-full px-2 py-1.5 text-[11px] bg-secondary rounded border-none outline-none resize-none placeholder:text-muted-foreground"
            rows={2}
          />
          <button
            onClick={handleSave}
            disabled={!summary.trim()}
            className="w-full px-2 py-1.5 text-[11px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {t('memory.saveSession', 'Save Session')}
          </button>
        </div>
      )}

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('memory.searchPlaceholder', 'Search memory...')}
            className="w-full pl-6 pr-2 py-1 text-[11px] bg-secondary rounded border-none outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {loading ? t('common.loading', 'Loading...') : t('memory.noSessions', 'No sessions found')}
          </div>
        ) : (
          sessions.map(session => {
            const isExpanded = expandedId === session.id
            const date = new Date(session.created_at)
            return (
              <div key={session.id} className="border-b border-border/50">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className="w-full text-left px-3 py-2 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {isExpanded
                        ? <ChevronDown size={11} className="text-muted-foreground" />
                        : <ChevronRight size={11} className="text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{session.note || session.label}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 ml-5 space-y-2">
                    {session.data?.decisions?.length ? (
                      <div>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Decisions</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {session.data.decisions.map((d, i) => (
                            <li key={i} className="text-[10px] text-foreground/80 pl-2 border-l border-blue-500/30">{d}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {session.data?.problems_solved?.length ? (
                      <div>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Problems Solved</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {session.data.problems_solved.map((p, i) => (
                            <li key={i} className="text-[10px] text-foreground/80 pl-2 border-l border-green-500/30">
                              <span className="text-muted-foreground">{p.problem}</span> → {p.solution}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {session.data?.next_steps?.length ? (
                      <div>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Next Steps</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {session.data.next_steps.map((s, i) => (
                            <li key={i} className="text-[10px] text-foreground/80 pl-2 border-l border-orange-500/30">{s}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {session.data?.key_files?.length ? (
                      <div>
                        <span className="text-[9px] font-semibold text-muted-foreground uppercase">Key Files</span>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {session.data.key_files.map((f, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary font-mono">{f.split('/').pop()}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <button
                      onClick={() => handleRestore(session)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors mt-2"
                    >
                      <Copy size={10} />
                      {t('memory.sendToAgent', 'Send to agent')}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
