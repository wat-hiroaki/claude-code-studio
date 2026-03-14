import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, statSync } from 'fs'
import path from 'path'

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal'
export type LogCategory = 'pty' | 'session' | 'ipc' | 'network' | 'ui' | 'system' | 'unknown'

export interface DiagnosticLog {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  details?: string
  agentId?: string
  sessionId?: string
  stack?: string
}

export interface DiagnosticStats {
  totalLogs: number
  errorCount: number
  warnCount: number
  fatalCount: number
  oldestLog: string | null
  newestLog: string | null
  logSizeBytes: number
}

const MAX_LOG_AGE_DAYS = 7
const MAX_LOGS_PER_FILE = 500
const LOG_DIR_NAME = 'logs'

export class DiagnosticsEngine {
  private logDir: string
  private enabled: boolean
  private buffer: DiagnosticLog[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(enabled = false) {
    this.enabled = enabled
    this.logDir = path.join(app.getPath('userData'), LOG_DIR_NAME)
    if (this.enabled) {
      this.ensureLogDir()
      this.rotateOldLogs()
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled) {
      this.ensureLogDir()
      this.rotateOldLogs()
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  log(level: LogLevel, category: LogCategory, message: string, extra?: Partial<Omit<DiagnosticLog, 'timestamp' | 'level' | 'category' | 'message'>>): void {
    if (!this.enabled) return

    const entry: DiagnosticLog = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...extra
    }

    this.buffer.push(entry)

    // Auto-flush on fatal or every 10 entries
    if (level === 'fatal' || this.buffer.length >= 10) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 5000)
    }
  }

  info(category: LogCategory, message: string, extra?: Partial<Omit<DiagnosticLog, 'timestamp' | 'level' | 'category' | 'message'>>): void {
    this.log('info', category, message, extra)
  }

  warn(category: LogCategory, message: string, extra?: Partial<Omit<DiagnosticLog, 'timestamp' | 'level' | 'category' | 'message'>>): void {
    this.log('warn', category, message, extra)
  }

  error(category: LogCategory, message: string, extra?: Partial<Omit<DiagnosticLog, 'timestamp' | 'level' | 'category' | 'message'>>): void {
    this.log('error', category, message, extra)
  }

  fatal(category: LogCategory, message: string, extra?: Partial<Omit<DiagnosticLog, 'timestamp' | 'level' | 'category' | 'message'>>): void {
    this.log('fatal', category, message, extra)
  }

  /**
   * Get recent logs for UI display. Returns newest first.
   */
  getLogs(limit = 100, levelFilter?: LogLevel, categoryFilter?: LogCategory): DiagnosticLog[] {
    const allLogs = this.readAllLogs()
    let filtered = allLogs

    if (levelFilter) {
      const levels: LogLevel[] = ['info', 'warn', 'error', 'fatal']
      const minIndex = levels.indexOf(levelFilter)
      filtered = filtered.filter(l => levels.indexOf(l.level) >= minIndex)
    }

    if (categoryFilter) {
      filtered = filtered.filter(l => l.category === categoryFilter)
    }

    return filtered
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  getStats(): DiagnosticStats {
    const allLogs = this.readAllLogs()
    const sorted = allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    let logSizeBytes = 0
    try {
      const files = readdirSync(this.logDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        logSizeBytes += statSync(path.join(this.logDir, f)).size
      }
    } catch { /* ignore */ }

    return {
      totalLogs: allLogs.length,
      errorCount: allLogs.filter(l => l.level === 'error').length,
      warnCount: allLogs.filter(l => l.level === 'warn').length,
      fatalCount: allLogs.filter(l => l.level === 'fatal').length,
      oldestLog: sorted.length > 0 ? sorted[0].timestamp : null,
      newestLog: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null,
      logSizeBytes
    }
  }

  /**
   * Export all logs as a single JSON string (for user download).
   */
  exportLogs(): string {
    const allLogs = this.readAllLogs()
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      logs: allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    }, null, 2)
  }

  /**
   * Clear all logs.
   */
  clearLogs(): void {
    try {
      const files = readdirSync(this.logDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        unlinkSync(path.join(this.logDir, f))
      }
    } catch { /* ignore */ }
    this.buffer = []
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length === 0) return

    try {
      this.ensureLogDir()
      const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const logFile = path.join(this.logDir, `diag-${dateStr}.json`)

      let existing: DiagnosticLog[] = []
      if (existsSync(logFile)) {
        try {
          existing = JSON.parse(readFileSync(logFile, 'utf-8'))
          if (!Array.isArray(existing)) existing = []
        } catch { existing = [] }
      }

      existing.push(...this.buffer)

      // Truncate to max per file
      if (existing.length > MAX_LOGS_PER_FILE) {
        existing = existing.slice(-MAX_LOGS_PER_FILE)
      }

      writeFileSync(logFile, JSON.stringify(existing, null, 0), 'utf-8')
      this.buffer = []
    } catch (err) {
      console.error('[Diagnostics] Failed to flush logs:', err)
    }
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  private rotateOldLogs(): void {
    try {
      const files = readdirSync(this.logDir).filter(f => f.startsWith('diag-') && f.endsWith('.json'))
      const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000

      for (const f of files) {
        const match = f.match(/diag-(\d{4}-\d{2}-\d{2})\.json/)
        if (match) {
          const fileDate = new Date(match[1]).getTime()
          if (fileDate < cutoff) {
            unlinkSync(path.join(this.logDir, f))
          }
        }
      }
    } catch { /* ignore */ }
  }

  private readAllLogs(): DiagnosticLog[] {
    const allLogs: DiagnosticLog[] = []
    try {
      if (!existsSync(this.logDir)) return allLogs
      const files = readdirSync(this.logDir).filter(f => f.startsWith('diag-') && f.endsWith('.json'))
      for (const f of files) {
        try {
          const content = JSON.parse(readFileSync(path.join(this.logDir, f), 'utf-8'))
          if (Array.isArray(content)) {
            allLogs.push(...content)
          }
        } catch { /* skip corrupt files */ }
      }
    } catch { /* ignore */ }
    // Also include unflushed buffer
    allLogs.push(...this.buffer)
    return allLogs
  }
}
