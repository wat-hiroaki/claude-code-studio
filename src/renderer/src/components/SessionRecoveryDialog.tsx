import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Link, Search, Folder, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOverlayClose } from '@/lib/useOverlayClose'
import { showToast } from '@components/ToastContainer'
import type { CliSessionInfo } from '@shared/types'

interface SessionRecoveryDialogProps {
  agentId: string
  projectPath: string
  onClose: () => void
  onAttached: () => void
}

export function SessionRecoveryDialog({ agentId, projectPath, onClose, onAttached }: SessionRecoveryDialogProps): JSX.Element {
  const { t } = useTranslation()
  const overlay = useOverlayClose(onClose)
  const [sessions, setSessions] = useState<CliSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [attaching, setAttaching] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.listCliSessions()
      setSessions(list)
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleAttach = useCallback(async (sessionId: string) => {
    setAttaching(sessionId)
    try {
      await window.api.attachSession(agentId, sessionId)
      showToast(t('session.attached', 'Session attached'), 'success')
      onAttached()
    } catch (err) {
      showToast(t('session.attachFailed', 'Failed to attach: {{error}}', { error: err instanceof Error ? err.message : String(err) }), 'error')
    } finally {
      setAttaching(null)
    }
  }, [agentId, onAttached, t])

  const filtered = sessions.filter((s) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      s.sessionId.toLowerCase().includes(q) ||
      s.projectPath.toLowerCase().includes(q) ||
      s.model.toLowerCase().includes(q)
    )
  })

  // Sort: matching project path first, then by last active
  const sorted = [...filtered].sort((a, b) => {
    const aMatch = a.projectPath === projectPath ? 0 : 1
    const bMatch = b.projectPath === projectPath ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  })

  const formatTime = (iso: string): string => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={overlay.onMouseDown} onClick={overlay.onClick}>
      <div className="bg-card border border-border rounded-xl w-[560px] max-h-[70vh] shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">{t('session.recovery', 'Attach to Existing Session')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadSessions} className="p-1 rounded hover:bg-muted/50 text-muted-foreground" title={t('common.reload', 'Reload')}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
          <Search size={14} className="text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('session.searchPlaceholder', 'Search by session ID, path, or model...')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              {t('common.loading', 'Loading...')}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <p>{t('session.noSessions', 'No CLI sessions found')}</p>
              <p className="text-[10px] text-muted-foreground/50">{t('session.noSessionsHint', 'Sessions from `claude` CLI will appear here')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {sorted.map((s) => {
                const isCurrentProject = s.projectPath === projectPath
                return (
                  <div
                    key={s.sessionId}
                    className={cn(
                      'px-4 py-3 hover:bg-muted/30 transition-colors',
                      isCurrentProject && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-foreground">{s.sessionId.slice(0, 12)}...</code>
                          {isCurrentProject && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                              {t('session.currentProject', 'This project')}
                            </span>
                          )}
                          {s.model && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s.model}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70">
                          <span className="flex items-center gap-1 truncate max-w-[250px]">
                            <Folder size={9} />
                            {s.projectPath}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Clock size={9} />
                            {formatTime(s.lastActiveAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAttach(s.sessionId)}
                        disabled={attaching === s.sessionId}
                        className={cn(
                          'shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                          attaching === s.sessionId
                            ? 'bg-muted text-muted-foreground cursor-wait'
                            : 'bg-primary/15 text-primary hover:bg-primary/25'
                        )}
                      >
                        {attaching === s.sessionId
                          ? t('session.attaching', 'Attaching...')
                          : t('session.attach', 'Attach')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground/50">
          {t('session.hint', 'Tip: Close the session in the other terminal first to avoid conflicts')}
        </div>
      </div>
    </div>
  )
}
