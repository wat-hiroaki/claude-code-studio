import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { readFileSync } from 'fs'
import type { Agent, AgentStatus, Workspace } from '@shared/types'
import type { Database } from './database'
import { stripAnsiCodes } from './utils'

interface SshSession {
  agentId: string
  client: Client
  channel: ClientChannel | null
  tmuxSessionName: string
  lastStatus: AgentStatus
  outputBuffer: string
  lastOutputLine: string
  _idleTimer?: ReturnType<typeof setTimeout>
}

type SshDataCallback = (agentId: string, data: string) => void
type SshStatusCallback = (agentId: string, status: AgentStatus) => void
type SshExitCallback = (agentId: string, exitCode: number) => void

export class SshSessionManager {
  private sessions: Map<string, SshSession> = new Map()
  private database: Database
  private onData: SshDataCallback
  private onStatusChange: SshStatusCallback
  private onExit: SshExitCallback

  constructor(
    database: Database,
    onData: SshDataCallback,
    onStatusChange: SshStatusCallback,
    onExit: SshExitCallback
  ) {
    this.database = database
    this.onData = onData
    this.onStatusChange = onStatusChange
    this.onExit = onExit
  }

  async startSession(agent: Agent, workspace: Workspace, cols = 120, rows = 30): Promise<void> {
    if (!workspace.sshConfig) {
      throw new Error('Workspace has no SSH configuration')
    }

    const { host, port, username, privateKeyPath } = workspace.sshConfig

    const connectConfig: ConnectConfig = {
      host,
      port: port || 22,
      username,
      readyTimeout: 10000
    }

    if (privateKeyPath) {
      try {
        connectConfig.privateKey = readFileSync(privateKeyPath.replace(/\\/g, '/'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Cannot read SSH key: ${privateKeyPath} (${msg})`)
      }
    }

    const sanitize = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
    const tmuxSessionName = `ccs-${sanitize(workspace.name)}-${sanitize(agent.name)}`

    return new Promise((resolve, reject) => {
      const client = new Client()
      let settled = false

      const safeReject = (err: Error): void => {
        if (settled) return
        settled = true
        this.sessions.delete(agent.id)
        this.database.updateAgent(agent.id, { status: 'error' })
        this.onStatusChange(agent.id, 'error')
        reject(err)
      }

      // Register error handler BEFORE connect to catch all connection errors
      client.on('error', (err) => {
        safeReject(err)
      })

      client.on('ready', () => {
        const session: SshSession = {
          agentId: agent.id,
          client,
          channel: null,
          tmuxSessionName,
          lastStatus: 'active',
          outputBuffer: '',
          lastOutputLine: ''
        }
        this.sessions.set(agent.id, session)

        // Build startup command:
        // 1. cd to project path if available
        // 2. Try tmux if available, otherwise plain shell
        // 3. Auto-start claude CLI (handles 3 cases: alive/dead/new)
        const projectPath = agent.projectPath || workspace.projects?.[0]?.path || workspace.path
        const cdCmd = projectPath ? `cd ${JSON.stringify(projectPath)} 2>/dev/null && ` : ''

        // tmux command with claude lifecycle management:
        // Case 1a: tmux session exists + claude alive → just attach (full session resume)
        // Case 1b: tmux session exists + claude dead → restart with --continue (preserve conversation)
        // Case 2:  no tmux session → create new + start claude
        // Case 3:  tmux not installed → direct shell
        const tmuxCmd = [
          `if command -v tmux >/dev/null 2>&1; then`,
          `  tmux set-option -g window-size largest 2>/dev/null;`,
          `  if tmux has-session -t ${tmuxSessionName} 2>/dev/null; then`,
          `    PANE_CMD=$(tmux display-message -t ${tmuxSessionName} -p '#{pane_current_command}' 2>/dev/null);`,
          `    case "$PANE_CMD" in`,
          `      bash|zsh|sh|fish|dash)`,
          `        tmux send-keys -t ${tmuxSessionName} "${cdCmd}claude --continue" Enter;;`,
          `    esac;`,
          `    tmux attach-session -t ${tmuxSessionName};`,
          `  else`,
          `    tmux new-session -d -s ${tmuxSessionName} -x ${cols} -y ${rows};`,
          `    tmux send-keys -t ${tmuxSessionName} "${cdCmd}claude" Enter;`,
          `    tmux attach-session -t ${tmuxSessionName};`,
          `  fi;`,
          `else`,
          `  ${cdCmd}claude;`,
          `fi`
        ].join(' ')

        client.shell({ term: 'xterm-256color', cols, rows }, (err, channel) => {
          if (err) {
            safeReject(err)
            return
          }

          session.channel = channel

          channel.on('data', (data: Buffer) => {
            const str = data.toString()
            this.onData(agent.id, str)
            this.detectStatus(session, str)
          })

          channel.on('close', () => {
            this.database.updateAgent(agent.id, { status: 'idle' })
            this.onStatusChange(agent.id, 'idle')
            this.onExit(agent.id, 0)
            this.sessions.delete(agent.id)
          })

          // Send startup command
          channel.write(tmuxCmd + '\n')

          this.database.updateAgent(agent.id, { status: 'active' })
          this.onStatusChange(agent.id, 'active')
          settled = true

          // Post-connection error/close handlers (after settled = true, safeReject becomes no-op)
          client.on('error', (err) => {
            console.error(`[SshSession] Post-connection error for ${agent.id}:`, err)
            this.sessions.delete(agent.id)
            this.database.updateAgent(agent.id, { status: 'error' })
            this.onStatusChange(agent.id, 'error')
            this.onExit(agent.id, 1)
          })

          client.on('close', () => {
            if (this.sessions.has(agent.id)) {
              this.sessions.delete(agent.id)
              this.database.updateAgent(agent.id, { status: 'idle' })
              this.onStatusChange(agent.id, 'idle')
              this.onExit(agent.id, 0)
            }
          })

          resolve()
        })
      })

      client.connect(connectConfig)
    })
  }

  writeInput(agentId: string, data: string): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    try { session.channel.write(data) } catch { /* EPIPE: channel closed */ }
  }

  resize(agentId: string, cols: number, rows: number): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    try { session.channel.setWindow(rows, cols, 0, 0) } catch { /* channel closed */ }
  }

  interruptSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    try { session.channel.write('\x03') } catch { /* EPIPE: channel closed */ }
  }

  stopSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    if (session._idleTimer) clearTimeout(session._idleTimer)
    // Detach from tmux first (so session persists on remote)
    if (session.channel) {
      try { session.channel.write('\x02d') } catch { /* channel closed */ } // Ctrl+B, d — tmux detach
      setTimeout(() => {
        session.client.removeAllListeners()
        session.client.end()
        this.sessions.delete(agentId)
      }, 500)
    } else {
      session.client.removeAllListeners()
      session.client.end()
      this.sessions.delete(agentId)
    }
  }

  stopAll(): void {
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

  // Lines that are static status indicators, not meaningful output
  private static readonly NOISE_PATTERNS = /^(\d+ tokens?|bypass permissions|medium|low|high|effort|shift\+tab)/i

  private detectStatus(session: SshSession, rawData: string): void {
    // Cap buffer at 2KB to prevent unbounded growth
    session.outputBuffer = (session.outputBuffer + rawData).slice(-2000)
    const recentClean = stripAnsiCodes(rawData)

    // Filter noise lines (token counts, status bar fragments)
    const meaningfulLines = recentClean.split('\n').map((l) => l.trim()).filter((l) => l.length > 2 && !SshSessionManager.NOISE_PATTERNS.test(l))

    // Track last meaningful output line for sidebar preview
    if (meaningfulLines.length > 0) {
      session.lastOutputLine = meaningfulLines[meaningfulLines.length - 1].slice(0, 80)
    }

    // If the entire chunk is noise, don't change status at all
    if (meaningfulLines.length === 0) return

    // Session conflict
    if (/already in use/i.test(recentClean)) {
      this.setStatus(session, 'session_conflict')
      return
    }

    // Tool execution patterns — match anywhere in the chunk (no ^ anchor)
    if (/(?:Read|Write|Edit|Search|Bash|MultiTool|ListDir|Grep|Glob|Agent|Skill)\(/.test(recentClean) ||
        /\btool uses\b/i.test(recentClean) ||
        /\+\d+ more tool uses/i.test(recentClean)) {
      this.setStatus(session, 'tool_running')
      const toolMatch = recentClean.match(/(?:Read|Write|Edit|Search|Bash|MultiTool|ListDir|Grep|Glob|Agent|Skill)\(/)
      if (toolMatch) {
        const toolName = toolMatch[0].replace('(', '')
        this.database.updateAgent(session.agentId, { currentTask: `Running ${toolName}...` })
      }
    }
    // Spinner characters = actively thinking
    else if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(rawData) || /Thinking\.\.\./.test(recentClean)) {
      this.setStatus(session, 'thinking')
    }
    // Awaiting user input (explicit permission prompts)
    else if (/Do you want to/i.test(recentClean) ||
             /\(y\/n\)/i.test(recentClean) ||
             /Allow this action\?/i.test(recentClean) ||
             (/\b(Allow|Deny)\b/.test(recentClean) && /\b(yes|no|allow|deny)\b/i.test(recentClean))) {
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

  private scheduleIdleReset(session: SshSession): void {
    if (session._idleTimer) clearTimeout(session._idleTimer)
    session._idleTimer = setTimeout(() => {
      // If output has stopped for 2s, assume Claude is waiting for input
      if (session.lastStatus !== 'active' && session.lastStatus !== 'session_conflict') {
        this.setStatus(session, 'active')
      }
    }, 2000)
  }

  /** Unified status update — same pattern as PtySessionManager */
  private setStatus(session: SshSession, newStatus: AgentStatus): void {
    if (newStatus === session.lastStatus) return
    session.lastStatus = newStatus
    this.database.updateAgent(session.agentId, {
      status: newStatus,
      ...(newStatus === 'active' ? { currentTask: null } : {})
    })
    this.onStatusChange(session.agentId, newStatus)
  }
}
