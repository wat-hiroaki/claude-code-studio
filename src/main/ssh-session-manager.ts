import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { readFileSync } from 'fs'
import type { Agent, AgentStatus, Workspace } from '@shared/types'
import type { Database } from './database'

interface SshSession {
  agentId: string
  client: Client
  channel: ClientChannel | null
  tmuxSessionName: string
  lastStatus: AgentStatus
  outputBuffer: string
  lastOutputLine: string
}

type SshDataCallback = (agentId: string, data: string) => void
type SshStatusCallback = (agentId: string, status: AgentStatus) => void
type SshExitCallback = (agentId: string, exitCode: number) => void

// ANSI escape sequence stripper
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

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
        connectConfig.privateKey = readFileSync(privateKeyPath)
      } catch {
        throw new Error(`Cannot read SSH key: ${privateKeyPath}`)
      }
    }

    const tmuxSessionName = `ccd-${workspace.name.replace(/\s+/g, '-').toLowerCase()}-${agent.name.replace(/\s+/g, '-').toLowerCase()}`

    return new Promise((resolve, reject) => {
      const client = new Client()

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

        // Set tmux to use largest window size, then create or attach to tmux session
        const tmuxCmd = [
          `tmux set-option -g window-size largest 2>/dev/null;`,
          `tmux has-session -t ${tmuxSessionName} 2>/dev/null`,
          `&& tmux attach-session -t ${tmuxSessionName}`,
          `|| tmux new-session -s ${tmuxSessionName} -x ${cols} -y ${rows}`
        ].join(' ')

        client.shell({ term: 'xterm-256color', cols, rows }, (err, channel) => {
          if (err) {
            reject(err)
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

          // Send the tmux command
          channel.write(tmuxCmd + '\n')

          this.database.updateAgent(agent.id, { status: 'active' })
          this.onStatusChange(agent.id, 'active')
          resolve()
        })
      })

      client.on('error', (err) => {
        this.sessions.delete(agent.id)
        this.database.updateAgent(agent.id, { status: 'error' })
        this.onStatusChange(agent.id, 'error')
        reject(err)
      })

      client.connect(connectConfig)
    })
  }

  writeInput(agentId: string, data: string): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    session.channel.write(data)
  }

  resize(agentId: string, cols: number, rows: number): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    session.channel.setWindow(rows, cols, 0, 0)
  }

  interruptSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session?.channel) return
    session.channel.write('\x03')
  }

  stopSession(agentId: string): void {
    const session = this.sessions.get(agentId)
    if (!session) return
    // Detach from tmux first (so session persists on remote)
    if (session.channel) {
      session.channel.write('\x02d') // Ctrl+B, d — tmux detach
      setTimeout(() => {
        session.client.end()
        this.sessions.delete(agentId)
      }, 500)
    } else {
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

  private detectStatus(session: SshSession, rawData: string): void {
    // Cap buffer at 2KB to prevent unbounded growth
    session.outputBuffer = (session.outputBuffer + rawData).slice(-2000)
    const recentClean = stripAnsi(rawData)
    const bufferClean = stripAnsi(session.outputBuffer)

    const lines = recentClean.split('\n').map((l) => l.trim()).filter((l) => l.length > 2)
    if (lines.length > 0) {
      session.lastOutputLine = lines[lines.length - 1].slice(0, 80)
    }

    let newStatus: AgentStatus | null = null

    if (/\b(Allow|Deny)\b/.test(recentClean) && /\b(yes|no|allow|deny)\b/i.test(recentClean)) {
      newStatus = 'awaiting'
    } else if (/⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(rawData) || /Thinking\.\.\./.test(recentClean)) {
      newStatus = 'thinking'
    } else if (/^ *(Read|Edit|Write|Bash|Glob|Grep|Agent|Skill)\b/.test(recentClean)) {
      newStatus = 'tool_running'
    } else if (/[❯>]\s*$/.test(bufferClean.split('\n').pop() ?? '')) {
      newStatus = 'active'
    }

    if (newStatus && newStatus !== session.lastStatus) {
      session.lastStatus = newStatus
      this.database.updateAgent(session.agentId, { status: newStatus })
      this.onStatusChange(session.agentId, newStatus)

      if (newStatus === 'tool_running') {
        const toolMatch = recentClean.match(/^ *(Read|Edit|Write|Bash|Glob|Grep|Agent|Skill)\b/)
        if (toolMatch) {
          this.database.updateAgent(session.agentId, { currentTask: `Running ${toolMatch[1]}...` })
        }
      } else if (newStatus === 'active') {
        this.database.updateAgent(session.agentId, { currentTask: null })
      }
    }
  }
}
