import * as pty from 'node-pty'
import { execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentStatus } from '@shared/types'
import type { Database } from './database'
import { validateProjectPath } from './sessionManager'
import { stripAnsiCodes } from './utils'

interface PtySession {
  agentId: string
  pty: pty.IPty
  sessionId: string
  outputBuffer: string
  scrollbackBuffer: string
  lastStatus: AgentStatus
  lastOutputLine: string
  memoryMB: number
  _retryCount?: number
  _conflictRetried?: boolean
  _idleTimer?: ReturnType<typeof setTimeout>
  _autoRecoveryCount: number
  _isResumed: boolean
  _cols: number
  _rows: number
}

export interface AgentMemoryInfo {
  agentId: string
  memoryMB: number
  pid: number
}

type PtyDataCallback = (agentId: string, data: string) => void
type PtyStatusCallback = (agentId: string, status: AgentStatus) => void
type PtyExitCallback = (agentId: string, exitCode: number) => void

export class PtySessionManager {
  private sessions: Map<string, PtySession> = new Map()
  private database: Database
  private claudePath: string
  private onData: PtyDataCallback
  private onStatusChange: PtyStatusCallback
  private onExit: PtyExitCallback

  constructor(
    database: Database,
    onData: PtyDataCallback,
    onStatusChange: PtyStatusCallback,
    onExit: PtyExitCallback
  ) {
    this.database = database
    this.onData = onData
    this.onStatusChange = onStatusChange
    this.onExit = onExit
    this.claudePath = this.resolveClaudePath()
  }

  private resolveClaudePath(): string {
    if (process.platform === 'win32') {
      const npmGlobal = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')
      if (existsSync(npmGlobal)) return npmGlobal

      try {
        const result = execFileSync('where', ['claude'], { encoding: 'utf-8' }).trim()
        const firstLine = result.split('\n')[0].trim()
        if (firstLine && existsSync(firstLine)) return firstLine
      } catch {
        /* not found */
      }
    } else {
      try {
        const result = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim()
        if (result && existsSync(result)) return result
      } catch {
        /* not found */
      }
    }
    return 'claude'
  }

  /** Maximum number of automatic recovery attempts after unexpected exit */
  private static readonly MAX_AUTO_RECOVERY = 3

  /** Base delay (ms) for exponential backoff on auto-recovery */
  private static readonly RECOVERY_BASE_DELAY_MS = 2000

  async startSession(agent: Agent, cols = 120, rows = 30): Promise<void> {
    validateProjectPath(agent.projectPath)

    // Kill any existing session for this agent to prevent conflict
    const existing = this.sessions.get(agent.id)
    if (existing) {
      console.warn(`[PtySession] Killing existing session for ${agent.id} before starting new one`)
      try { existing.pty.kill() } catch { /* ignore */ }
      this.sessions.delete(agent.id)
    }

    const sessionId = agent.claudeSessionId || uuidv4()
    const isResume = !!agent.claudeSessionId

    // Interactive mode — use --resume for existing sessions to restore conversation
    const args: string[] = isResume
      ? ['--resume', sessionId, '--verbose']
      : ['--session-id', sessionId, '--verbose']

    if (agent.systemPrompt) {
      args.push('--system-prompt', agent.systemPrompt)
    }

    // On Windows, node-pty needs the shell for .cmd files
    const shell = process.platform === 'win32' ? 'cmd.exe' : this.claudePath
    const shellArgs =
      process.platform === 'win32' ? ['/c', this.claudePath, ...args] : args

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: agent.projectPath,
      env: { ...process.env } as Record<string, string>
    })

    const session: PtySession = {
      agentId: agent.id,
      pty: ptyProcess,
      sessionId,
      outputBuffer: '',
      scrollbackBuffer: this.database.getScrollback(agent.id),
      lastStatus: 'active',
      lastOutputLine: '',
      memoryMB: 0,
      _conflictRetried: false,
      _autoRecoveryCount: existing?._autoRecoveryCount ?? 0,
      _isResumed: isResume,
      _cols: cols,
      _rows: rows
    }

    ptyProcess.onData((data: string) => {
      try {
        this.onData(agent.id, data)
        // Accumulate scrollback (max 50KB)
        session.scrollbackBuffer = (session.scrollbackBuffer + data).slice(-50000)
        this.detectAndUpdateStatus(session, data)

        // Auto-recovery: if session conflict detected and not yet retried
        if (session.lastStatus === 'session_conflict' && !session._conflictRetried) {
          session._conflictRetried = true
          console.warn(`[PtySession] Auto-recovering from session conflict for ${agent.id}`)
          // Kill this process and restart with a new session ID
          setTimeout(() => {
            try { ptyProcess.kill() } catch { /* ignore */ }
            this.sessions.delete(agent.id)
            const newAgent = { ...agent, claudeSessionId: uuidv4() }
            this.database.updateAgent(agent.id, { claudeSessionId: newAgent.claudeSessionId })
            this.startSession(newAgent, cols, rows).catch((err) => {
              console.error(`[PtySession] Auto-recovery failed for ${agent.id}:`, err)
            })
          }, 500)
        }
      } catch (err) {
        console.error(`[PtySession] onData error for ${agent.id}:`, err)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      try {
        // Save scrollback to DB before deleting session
        if (session.scrollbackBuffer) {
          this.database.saveAllScrollbacks({ [agent.id]: session.scrollbackBuffer })
        }
        if (session._idleTimer) clearTimeout(session._idleTimer)
        const isKilled = !this.sessions.has(agent.id)
        const isWindowsCtrlC = process.platform === 'win32' && exitCode === -1073741510
        const isSuccess = exitCode === 0 || isKilled || isWindowsCtrlC

        // Auto-recovery: retry on unexpected exit (network errors, crashes)
        // Skip if user explicitly stopped or if max retries reached
        if (!isSuccess && !isKilled && session._autoRecoveryCount < PtySessionManager.MAX_AUTO_RECOVERY) {
          const attempt = session._autoRecoveryCount + 1
          const delay = PtySessionManager.RECOVERY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
          console.warn(`[PtySession] Unexpected exit (code=${exitCode}) for ${agent.id}. Auto-recovery attempt ${attempt}/${PtySessionManager.MAX_AUTO_RECOVERY} in ${delay}ms`)

          this.database.updateAgent(agent.id, { status: 'error' })
          this.onStatusChange(agent.id, 'error')
          this.sessions.delete(agent.id)

          setTimeout(() => {
            const currentAgent = this.database.getAgent(agent.id)
            if (!currentAgent || this.sessions.has(agent.id)) return
            // Carry forward the recovery count
            const recoveryAgent = { ...currentAgent }
            this.startSession(recoveryAgent, session._cols, session._rows)
              .then(() => {
                const newSession = this.sessions.get(agent.id)
                if (newSession) newSession._autoRecoveryCount = attempt
                console.info(`[PtySession] Auto-recovery succeeded for ${agent.id} (attempt ${attempt})`)
              })
              .catch((err) => {
                console.error(`[PtySession] Auto-recovery failed for ${agent.id}:`, err)
                this.database.updateAgent(agent.id, { status: 'error' })
                this.onStatusChange(agent.id, 'error')
              })
          }, delay)

          this.onExit(agent.id, exitCode)
          return
        }

        const status: AgentStatus = isSuccess ? 'idle' : 'error'
        this.database.updateAgent(agent.id, { status })
        this.onStatusChange(agent.id, status)
        this.onExit(agent.id, exitCode)
      } catch (err) {
        console.error(`[PtySession] onExit error for ${agent.id}:`, err)
      } finally {
        this.sessions.delete(agent.id)
      }
    })

    this.sessions.set(agent.id, session)
    this.database.updateAgent(agent.id, { status: 'active', claudeSessionId: sessionId })
    this.onStatusChange(agent.id, 'active')
  }

  writeInput(agentId: string, data: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    try { session.pty.write(data) } catch { /* EPIPE: session already exited */ }
  }

  resize(agentId: string, cols: number, rows: number): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    try { session.pty.resize(cols, rows) } catch { /* session already exited */ }
  }

  interruptSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    try { session.pty.write('\x03') } catch { /* EPIPE: session already exited */ }
  }

  stopSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    // Clear idle timer to prevent leaked timers after session destruction
    if (session._idleTimer) {
      clearTimeout(session._idleTimer)
      session._idleTimer = undefined
    }
    session.pty.kill()
    this.sessions.delete(agentId)
  }

  stopAll(): void {
    // Save all scrollbacks before stopping
    const scrollbacks: Record<string, string> = {}
    for (const [id, session] of this.sessions) {
      scrollbacks[id] = session.scrollbackBuffer
    }
    this.database.saveAllScrollbacks(scrollbacks)

    for (const [id] of this.sessions) {
      this.stopSession(id)
    }
  }

  hasSession(agentId: string): boolean {
    return this.sessions.has(agentId)
  }

  getSessionPid(agentId: string): number | null {
    const session = this.sessions.get(agentId)
    return session ? session.pty.pid : null
  }

  getLastOutputLine(agentId: string): string {
    return this.sessions.get(agentId)?.lastOutputLine ?? ''
  }

  /** Get memory usage for all active sessions */
  async pollMemoryUsage(): Promise<AgentMemoryInfo[]> {
    const results: AgentMemoryInfo[] = []
    const pids: { agentId: string; pid: number }[] = []

    for (const [agentId, session] of this.sessions) {
      const pid = session.pty.pid
      if (pid) pids.push({ agentId, pid })
    }

    if (pids.length === 0) return results

    if (process.platform === 'win32') {
      // Windows: PTY spawns cmd.exe, which spawns claude.cmd -> node.exe
      // We need to sum memory of all descendant processes under each parent PID
      try {
        const pidList = pids.map(p => p.pid)
        const pidConditions = pidList.map(pid => `$_.ParentProcessId -eq ${pid}`).join(' -or ')
        const psCommand = [
          `$procs = Get-CimInstance Win32_Process;`,
          `$children = $procs | Where-Object { ${pidConditions} };`,
          // Also get grandchildren (cmd.exe -> claude.cmd -> node.exe)
          `$grandPids = $children | ForEach-Object { $_.ProcessId };`,
          `$grandChildren = $procs | Where-Object { $grandPids -contains $_.ParentProcessId };`,
          `$all = @($children) + @($grandChildren) | Where-Object { $_ -ne $null };`,
          `$all | ForEach-Object { Write-Output "$($_.ParentProcessId)|$($_.ProcessId)|$($_.WorkingSetSize)" }`
        ].join(' ')

        const output = await new Promise<string>((resolve, reject) => {
          execFile('powershell.exe', ['-NoProfile', '-Command', psCommand], { timeout: 8000 }, (err, stdout) => {
            if (err) reject(err)
            else resolve(stdout)
          })
        })

        // Single pass: map each process to its root PID and sum memory
        const memByRootPid = new Map<number, number>()
        const childToRoot = new Map<number, number>()
        for (const line of output.trim().split('\n')) {
          const parts = line.trim().split('|')
          if (parts.length < 3) continue
          const parentPid = parseInt(parts[0])
          const childPid = parseInt(parts[1])
          const workingSet = parseInt(parts[2])
          if (isNaN(parentPid) || isNaN(childPid) || isNaN(workingSet)) continue

          // Determine which root PID this process belongs to
          let rootPid: number | undefined
          if (pidList.includes(parentPid)) {
            rootPid = parentPid
          } else if (childToRoot.has(parentPid)) {
            rootPid = childToRoot.get(parentPid)
          }

          if (rootPid !== undefined) {
            childToRoot.set(childPid, rootPid)
            const mb = Math.round(workingSet / (1024 * 1024))
            memByRootPid.set(rootPid, (memByRootPid.get(rootPid) || 0) + mb)
          }
        }

        for (const { agentId, pid } of pids) {
          const mb = memByRootPid.get(pid) || 0
          const session = this.sessions.get(agentId)
          if (session) session.memoryMB = mb
          results.push({ agentId, memoryMB: mb, pid })
        }
      } catch {
        // Fallback: return last known values
        for (const { agentId, pid } of pids) {
          const session = this.sessions.get(agentId)
          results.push({ agentId, memoryMB: session?.memoryMB || 0, pid })
        }
      }
    } else {
      // Unix: use ps
      try {
        const pidList = pids.map(p => p.pid).join(',')
        const output = await new Promise<string>((resolve, reject) => {
          execFile('ps', ['-o', 'pid=,rss=', '-p', pidList], { timeout: 5000 }, (err, stdout) => {
            if (err) reject(err)
            else resolve(stdout)
          })
        })
        const memByPid = new Map<number, number>()
        for (const line of output.trim().split('\n')) {
          const parts = line.trim().split(/\s+/)
          if (parts.length === 2) {
            memByPid.set(parseInt(parts[0]), Math.round(parseInt(parts[1]) / 1024))
          }
        }
        for (const { agentId, pid } of pids) {
          const mb = memByPid.get(pid) || 0
          const session = this.sessions.get(agentId)
          if (session) session.memoryMB = mb
          results.push({ agentId, memoryMB: mb, pid })
        }
      } catch {
        for (const { agentId, pid } of pids) {
          const session = this.sessions.get(agentId)
          results.push({ agentId, memoryMB: session?.memoryMB || 0, pid })
        }
      }
    }

    return results
  }

  /** Get cached memory for a single agent */
  getMemoryMB(agentId: string): number {
    return this.sessions.get(agentId)?.memoryMB || 0
  }

  getScrollback(agentId: string): string {
    const session = this.sessions.get(agentId)
    if (session) return session.scrollbackBuffer
    return this.database.getScrollback(agentId)
  }

  private setStatus(session: PtySession, newStatus: AgentStatus): void {
    if (newStatus === session.lastStatus) return
    session.lastStatus = newStatus
    // Reset auto-recovery counter once session is stable again
    if (newStatus === 'active' || newStatus === 'thinking' || newStatus === 'tool_running') {
      session._autoRecoveryCount = 0
    }
    this.database.updateAgent(session.agentId, {
      status: newStatus,
      ...(newStatus === 'active' ? { currentTask: null } : {})
    })
    this.onStatusChange(session.agentId, newStatus)
  }

  private scheduleIdleReset(session: PtySession): void {
    if (session._idleTimer) clearTimeout(session._idleTimer)
    session._idleTimer = setTimeout(() => {
      // If output has stopped for 2s, assume Claude is waiting for input
      if (session.lastStatus !== 'active' && session.lastStatus !== 'session_conflict') {
        this.setStatus(session, 'active')
      }
    }, 2000)
  }

  // Lines that are static status indicators, not meaningful output
  private static readonly NOISE_PATTERNS = /^(\d+ tokens?|bypass permissions|medium|low|high|effort|shift\+tab)/i

  private detectAndUpdateStatus(session: PtySession, rawData: string): void {
    session.outputBuffer = (session.outputBuffer + rawData).slice(-500)
    const recentClean = stripAnsiCodes(rawData)

    // Ignore noise-only output (token counts, status bar fragments)
    const meaningfulLines = recentClean.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !PtySessionManager.NOISE_PATTERNS.test(l))

    // Track last meaningful output line for sidebar preview
    if (meaningfulLines.length > 0) {
      session.lastOutputLine = meaningfulLines[meaningfulLines.length - 1].slice(0, 80)
    }

    // If the entire chunk is noise, don't change status at all
    if (meaningfulLines.length === 0) return

    // Session conflict — notify UI instead of auto-killing
    if (/already in use/i.test(recentClean)) {
      this.setStatus(session, 'session_conflict')
      console.warn(`[PtySession] Session conflict detected for ${session.agentId}. Awaiting user action.`)
      return
    }

    // Tool execution patterns (Read, Write, Search, Bash, etc.)
    if (/(?:Read|Write|Edit|Search|Bash|MultiTool|ListDir|Grep)\(/.test(recentClean) ||
        /\btool uses\b/i.test(recentClean) ||
        /\+\d+ more tool uses/i.test(recentClean)) {
      this.setStatus(session, 'tool_running')
    }
    // Spinner characters = actively thinking
    else if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(rawData)) {
      this.setStatus(session, 'thinking')
    }
    // Awaiting user input (explicit permission prompts only)
    // Note: "bypass permissions on" is a static status line, NOT a prompt — excluded
    else if (/Do you want to/i.test(recentClean) ||
             /\(y\/n\)/i.test(recentClean) ||
             /Allow this action\?/i.test(recentClean)) {
      this.setStatus(session, 'awaiting')
    }
    // Error detection
    else if (/^Error:/im.test(recentClean) ||
             /APIError|NetworkError|RateLimitError/i.test(recentClean)) {
      this.setStatus(session, 'error')
    }

    // Always schedule an idle reset — if output stops, go back to active
    this.scheduleIdleReset(session)
  }

  /**
   * Resolve session conflict by starting with a new session ID.
   * Called from renderer via IPC when user explicitly chooses to recover.
   */
  async resolveSessionConflict(agentId: string): Promise<void> {
    const agent = this.database.getAgent(agentId)
    if (!agent) return

    // Save scrollback before stopping
    const session = this.sessions.get(agentId)
    if (session?.scrollbackBuffer) {
      this.database.saveAllScrollbacks({ [agentId]: session.scrollbackBuffer })
    }

    this.stopSession(agentId)
    const newSessionId = uuidv4()
    this.database.updateAgent(agent.id, { claudeSessionId: newSessionId })
    try {
      await this.startSession({ ...agent, claudeSessionId: newSessionId })
    } catch (err) {
      console.error(`[PtySession] resolveSessionConflict failed for ${agentId}:`, err)
      this.database.updateAgent(agent.id, { status: 'error' })
      this.onStatusChange(agent.id, 'error')
    }
  }
}
