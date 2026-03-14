import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  Download,
  Trash2,
  RefreshCw,
  Shield,
  ShieldOff
} from 'lucide-react'
import { cn } from '../lib/utils'
import type { DiagnosticLog, DiagnosticStats } from '@shared/types'

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-600 font-bold'
}

const LEVEL_BG: Record<string, string> = {
  info: 'bg-blue-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  fatal: 'bg-red-600/20'
}

export function DiagnosticsPanel(): JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [logs, setLogs] = useState<DiagnosticLog[]>([])
  const [stats, setStats] = useState<DiagnosticStats | null>(null)
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [expandedLog, setExpandedLog] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [isEnabled, logData, statsData] = await Promise.all([
        window.api.isDiagnosticsEnabled(),
        window.api.getDiagnosticLogs(200, levelFilter === 'all' ? undefined : levelFilter),
        window.api.getDiagnosticStats()
      ])
      setEnabled(isEnabled)
      setLogs(logData)
      setStats(statsData)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [levelFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleToggle = async (): Promise<void> => {
    const next = !enabled
    await window.api.setDiagnosticsEnabled(next)
    setEnabled(next)
    if (next) refresh()
  }

  const handleExport = async (): Promise<void> => {
    const path = await window.api.exportDiagnostics()
    if (path) {
      // Show a success indicator briefly
      setLoading(true)
      setTimeout(() => setLoading(false), 500)
    }
  }

  const handleClear = async (): Promise<void> => {
    await window.api.clearDiagnostics()
    setLogs([])
    setStats(null)
    refresh()
  }

  const formatTs = (ts: string): string => {
    try {
      const d = new Date(ts)
      return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ts
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h3 className="text-sm font-semibold">Diagnostics</h3>
        </div>
        <button
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            enabled
              ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          )}
        >
          {enabled ? <Shield size={12} /> : <ShieldOff size={12} />}
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {!enabled && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
          <ShieldOff size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Diagnostics logging is disabled. Enable it to collect error logs
            for troubleshooting session issues and crashes.
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Logs are stored locally and never sent externally. 7-day auto-rotation.
          </p>
        </div>
      )}

      {enabled && (
        <>
          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-lg font-bold text-foreground">{stats.totalLogs}</p>
                <p className="text-[9px] text-muted-foreground">Total</p>
              </div>
              <div className="rounded-md bg-red-500/10 p-2 text-center">
                <p className="text-lg font-bold text-red-400">{stats.errorCount + stats.fatalCount}</p>
                <p className="text-[9px] text-muted-foreground">Errors</p>
              </div>
              <div className="rounded-md bg-yellow-500/10 p-2 text-center">
                <p className="text-lg font-bold text-yellow-400">{stats.warnCount}</p>
                <p className="text-[9px] text-muted-foreground">Warnings</p>
              </div>
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-lg font-bold text-foreground">{formatBytes(stats.logSizeBytes)}</p>
                <p className="text-[9px] text-muted-foreground">Size</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="flex-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground border-none outline-none"
            >
              <option value="all">All Levels</option>
              <option value="info">Info+</option>
              <option value="warn">Warn+</option>
              <option value="error">Error+</option>
              <option value="fatal">Fatal only</option>
            </select>
            <button onClick={refresh} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Refresh">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleExport} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Export">
              <Download size={12} />
            </button>
            <button onClick={handleClear} className="p-1.5 rounded-md hover:bg-destructive/20 text-destructive transition-colors" title="Clear all">
              <Trash2 size={12} />
            </button>
          </div>

          {/* Log List */}
          <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No logs recorded yet. Logs will appear here when events are captured.
              </div>
            ) : (
              logs.map((log, i) => (
                <button
                  key={`${log.timestamp}-${i}`}
                  onClick={() => setExpandedLog(expandedLog === i ? null : i)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 border-b border-border/50 hover:bg-accent/30 transition-colors',
                    LEVEL_BG[log.level]
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[9px] font-mono uppercase w-10', LEVEL_COLORS[log.level])}>
                      {log.level}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono w-16 shrink-0">
                      {log.category}
                    </span>
                    <span className="text-[10px] truncate flex-1">{log.message}</span>
                    <span className="text-[8px] text-muted-foreground shrink-0">
                      {formatTs(log.timestamp)}
                    </span>
                  </div>
                  {expandedLog === i && (
                    <div className="mt-1.5 pl-12 space-y-1">
                      {log.agentId && (
                        <p className="text-[9px] text-muted-foreground">
                          Agent: <span className="text-foreground font-mono">{log.agentId}</span>
                        </p>
                      )}
                      {log.details && (
                        <p className="text-[9px] text-muted-foreground">
                          Details: <span className="text-foreground">{log.details}</span>
                        </p>
                      )}
                      {log.stack && (
                        <pre className="text-[8px] text-red-400/80 bg-black/30 rounded p-1.5 overflow-x-auto max-h-[100px]">
                          {log.stack}
                        </pre>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Privacy Notice */}
          <div className="flex items-start gap-2 rounded-md bg-muted/30 p-2">
            <AlertTriangle size={12} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              Logs are stored locally at <code className="text-foreground">~/.claude-code-desktop/logs/</code> and auto-rotate every 7 days. No data is sent externally.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
