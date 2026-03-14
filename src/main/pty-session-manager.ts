import * as pty from 'node-pty'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentStatus } from '@shared/types'
import type { Database } from './database'
import { validateProjectPath } from './session-manager'

interface PtySession {
  agentId: string
  pty: pty.IPty
  sessionId: string
  outputBuffer: string
  scrollbackBuffer: string
  lastStatus: AgentStatus
  lastOutputLine: string
  _retryCount?: number
  _idleTimer?: ReturnType<typeof setTimeout>
}

type PtyDataCallback = (agentId: string, data: string) => void
type PtyStatusCallback = (agentId: string, status: AgentStatus) => void
type PtyExitCallback = (agentId: string, exitCode: number) => void

// ANSI escape sequence stripper for status detection
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

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

  async startSession(agent: Agent, cols = 120, rows = 30): Promise<void> {
    validateProjectPath(agent.projectPath)

    const sessionId = agent.claudeSessionId || uuidv4()

    // Interactive mode — no stream-json flags
    const args: string[] = ['--session-id', sessionId, '--verbose']

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
      lastOutputLine: ''
    }

    ptyProcess.onData((data: string) => {
      try {
        this.onData(agent.id, data)
        // Accumulate scrollback (max 50KB)
        session.scrollbackBuffer = (session.scrollbackBuffer + data).slice(-50000)
        this.detectAndUpdateStatus(session, data)
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
        const status: AgentStatus = exitCode === 0 ? 'idle' : 'error'
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
    session.pty.write(data)
  }

  resize(agentId: string, cols: number, rows: number): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    session.pty.resize(cols, rows)
  }

  interruptSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    // Send Ctrl+C
    session.pty.write('\x03')
  }

  stopSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
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

  getLastOutputLine(agentId: string): string {
    return this.sessions.get(agentId)?.lastOutputLine ?? ''
  }

  getScrollback(agentId: string): string {
    const session = this.sessions.get(agentId)
    if (session) return session.scrollbackBuffer
    return this.database.getScrollback(agentId)
  }

  private setStatus(session: PtySession, newStatus: AgentStatus): void {
    if (newStatus === session.lastStatus) return
    session.lastStatus = newStatus
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

  private detectAndUpdateStatus(session: PtySession, rawData: string): void {
    session.outputBuffer = (session.outputBuffer + rawData).slice(-500)
    const recentClean = stripAnsi(rawData)

    // Track last meaningful output line for sidebar preview
    const lines = recentClean.split('\n').map((l) => l.trim()).filter((l) => l.length > 2)
    if (lines.length > 0) {
      session.lastOutputLine = lines[lines.length - 1].slice(0, 80)
    }

    // Session conflict — notify UI instead of auto-killing
    if (/already in use/i.test(recentClean)) {
      this.setStatus(session, 'session_conflict')
      // Do NOT auto-kill: let the user decide via SessionRecoveryDialog
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
    // Awaiting user input (bypass permissions prompt or similar)
    else if (/bypass permissions on/i.test(recentClean) ||
             /Do you want to/i.test(recentClean) ||
             /\(y\/n\)/i.test(recentClean)) {
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
