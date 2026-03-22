import { spawn, execFile, execFileSync, type ChildProcess } from 'child_process'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentStatus, MessageRole, ContentType } from '@shared/types'
import type { Database } from './database'
import { t } from './i18n'

/**
 * Validates that projectPath is safe to use as a working directory for spawn.
 * - Must be an absolute path
 * - Must not contain path traversal components (..)
 * - Must exist and be a directory
 */
export function validateProjectPath(projectPath: string): void {
  // Resolve to absolute canonical path first (collapses .., ., etc.)
  const resolved = path.resolve(projectPath)

  // Check for path traversal components after resolution
  const normalized = resolved.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (segments.some((seg) => seg === '..')) {
    throw new Error(`Invalid project path: path traversal (..) is not allowed: ${projectPath}`)
  }

  // Must be absolute (works for both Windows C:/... and Unix /...)
  if (!path.isAbsolute(resolved)) {
    throw new Error(`Invalid project path: must be an absolute path: ${projectPath}`)
  }

  // Must exist
  if (!existsSync(resolved)) {
    throw new Error(`Invalid project path: directory does not exist: ${projectPath}`)
  }

  // Must be a directory
  const stat = statSync(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`Invalid project path: not a directory: ${projectPath}`)
  }
}

interface ParsedMessage {
  role: MessageRole
  contentType: ContentType
  content: string
  metadata?: Record<string, unknown>
}

interface Session {
  agentId: string
  process: ChildProcess | null
  sessionId: string
  lineBuffer: string
}

type OutputCallback = (agentId: string, message: ParsedMessage) => void
type StatusCallback = (agentId: string, status: AgentStatus) => void

export class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private onOutput: OutputCallback
  private onStatusChange: StatusCallback
  private database: Database
  private claudePath: string

  constructor(database: Database, onOutput: OutputCallback, onStatusChange: StatusCallback) {
    this.database = database
    this.onOutput = onOutput
    this.onStatusChange = onStatusChange
    this.claudePath = this.resolveClaudePath()
  }

  private resolveClaudePath(): string {
    // Try to find claude CLI in common locations
    if (process.platform === 'win32') {
      // On Windows, try npm global path first
      const npmGlobal = path.join(
        process.env.APPDATA || '',
        'npm',
        'claude.cmd'
      )
      if (existsSync(npmGlobal)) return npmGlobal

      // Try `where claude` as fallback
      try {
        const result = execFileSync('where', ['claude'], { encoding: 'utf-8' }).trim()
        const firstLine = result.split('\n')[0].trim()
        if (firstLine && existsSync(firstLine)) return firstLine
      } catch { /* not found */ }
    } else {
      // Unix: try `which claude`
      try {
        const result = execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim()
        if (result && existsSync(result)) return result
      } catch { /* not found */ }
    }

    // Fallback: hope it's in PATH with shell
    return 'claude'
  }

  async startSession(agent: Agent): Promise<void> {
    // Validate project path before spawning any process
    validateProjectPath(agent.projectPath)

    const sessionId = agent.claudeSessionId || uuidv4()

    // Use stream-json bidirectional mode
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--session-id', sessionId,
      '--include-partial-messages',
      '--verbose'
    ]

    if (agent.systemPrompt) {
      args.push('--system-prompt', agent.systemPrompt)
    }

    // On Windows, .cmd/.bat files require shell: true to spawn correctly
    const useShell = process.platform === 'win32' || this.claudePath === 'claude'
    const proc = spawn(this.claudePath, args, {
      cwd: agent.projectPath,
      env: { ...process.env },
      shell: useShell,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const session: Session = {
      agentId: agent.id,
      process: proc,
      sessionId,
      lineBuffer: ''
    }

    proc.stdout?.setEncoding('utf-8')
    proc.stderr?.setEncoding('utf-8')

    proc.stdout?.on('data', (chunk: string) => {
      this.handleChunk(session, chunk)
    })

    proc.stderr?.on('data', (chunk: string) => {
      // stderr is typically debug/error info
      if (chunk.includes('already in use') || chunk.includes('Session ID') && chunk.includes('in use')) {
        // Session conflict: auto-resolve by generating a new session ID and restarting
        const retryCount = (session as Session & { _retryCount?: number })._retryCount || 0
        if (retryCount < 2) {
          this.onOutput(agent.id, {
            role: 'system',
            contentType: 'text',
            content: t('session.conflictDetected')
          })
          // Stop current process, generate new session ID, and restart
          this.stopSession(agent.id).then(() => {
            const newSessionId = uuidv4()
            this.database.updateAgent(agent.id, { claudeSessionId: newSessionId } as Partial<Agent>)
            const updatedAgent = { ...agent, claudeSessionId: newSessionId }
            // Track retry count on next session
            this.startSession(updatedAgent).then(() => {
              const newSession = this.sessions.get(agent.id)
              if (newSession) {
                (newSession as Session & { _retryCount?: number })._retryCount = retryCount + 1
              }
            }).catch(() => {
              this.updateStatus(agent.id, 'error')
            })
          }).catch(() => {
            this.updateStatus(agent.id, 'error')
          })
        } else {
          // Max retries exceeded
          this.updateStatus(agent.id, 'session_conflict')
          this.onOutput(agent.id, {
            role: 'system',
            contentType: 'error',
            content: t('session.conflictFailed')
          })
        }
      } else if (chunk.includes('Error') || chunk.includes('error')) {
        this.updateStatus(agent.id, 'error')
        this.onOutput(agent.id, {
          role: 'system',
          contentType: 'error',
          content: chunk.trim()
        })
      }
    })

    proc.on('exit', (code) => {
      const status: AgentStatus = code === 0 ? 'idle' : 'error'
      this.database.updateAgent(agent.id, { status })
      this.onStatusChange(agent.id, status)
      this.sessions.delete(agent.id)
    })

    proc.on('error', (err) => {
      console.error('[SessionManager] CLI start error:', err.message)
      this.database.updateAgent(agent.id, { status: 'error' })
      this.onStatusChange(agent.id, 'error')
      this.onOutput(agent.id, {
        role: 'system',
        contentType: 'error',
        content: t('error.cliStartFailed')
      })
      this.sessions.delete(agent.id)
    })

    this.sessions.set(agent.id, session)
    this.database.updateAgent(agent.id, { status: 'active', claudeSessionId: sessionId })
    this.onStatusChange(agent.id, 'active')
  }

  async sendInput(agentId: string, input: string): Promise<void> {
    const session = this.sessions.get(agentId)
    if (!session?.process?.stdin?.writable) return

    // stream-json input format: send JSON message followed by newline
    const message = JSON.stringify({
      type: 'user',
      content: input
    })
    session.process.stdin.write(message + '\n')
  }

  async interruptSession(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId)
    if (!session?.process?.pid) return

    if (process.platform === 'win32') {
      // Windows: use taskkill to kill process tree (execFile to avoid shell injection)
      execFile('taskkill', ['/pid', String(session.process.pid), '/t', '/f'], (err) => {
        if (err) {
          // Fallback: try regular kill
          try { session.process?.kill() } catch { /* already dead */ }
        }
      })
    } else {
      session.process.kill('SIGINT')
    }
  }

  async stopSession(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId)
    if (!session?.process) return

    if (process.platform === 'win32' && session.process.pid) {
      execFile('taskkill', ['/pid', String(session.process.pid), '/t', '/f'], () => {
        this.sessions.delete(agentId)
      })
    } else {
      session.process.kill()
      this.sessions.delete(agentId)
    }
  }

  stopAll(): void {
    for (const [id] of this.sessions) {
      this.stopSession(id)
    }
  }

  resumeSession(agent: Agent): Promise<void> {
    // Resume a previous session by reusing the session ID
    return this.startSession(agent)
  }

  private handleChunk(session: Session, chunk: string): void {
    session.lineBuffer += chunk

    // Cap lineBuffer to prevent unbounded growth from long lines
    if (session.lineBuffer.length > 100000) {
      session.lineBuffer = session.lineBuffer.slice(-50000)
    }

    // Process complete lines only
    const lines = session.lineBuffer.split('\n')
    // Keep the last incomplete line in the buffer
    session.lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.parseLine(session.agentId, trimmed)
    }
  }

  private parseLine(agentId: string, line: string): void {
    try {
      const event = JSON.parse(line)
      this.handleStreamEvent(agentId, event)
    } catch {
      // Non-JSON output, treat as plain text
      if (line.trim()) {
        this.onOutput(agentId, {
          role: 'agent',
          contentType: 'text',
          content: line
        })
      }
    }
  }

  private handleStreamEvent(agentId: string, event: Record<string, unknown>): void {
    const type = event.type as string

    switch (type) {
      case 'system': {
        this.onOutput(agentId, {
          role: 'system',
          contentType: 'text',
          content: (event.message as string) || 'Session started',
          metadata: event
        })
        this.updateStatus(agentId, 'active')
        break
      }

      case 'assistant': {
        const subtype = event.subtype as string | undefined
        if (subtype === 'thinking') {
          this.updateStatus(agentId, 'thinking')
          // Don't emit thinking content to chat by default
        } else {
          const content = this.extractTextContent(event)
          if (content) {
            this.onOutput(agentId, {
              role: 'agent',
              contentType: 'text',
              content,
              metadata: event
            })
          }
        }
        break
      }

      case 'tool_use': {
        this.updateStatus(agentId, 'tool_running')
        const toolName = (event.name as string) || 'tool'
        const toolInput = event.input ? JSON.stringify(event.input, null, 2) : ''
        this.database.updateAgent(agentId, { currentTask: `Running ${toolName}...` })
        this.onOutput(agentId, {
          role: 'tool',
          contentType: 'tool_exec',
          content: `[${toolName}]\n${toolInput}`,
          metadata: event
        })
        break
      }

      case 'tool_result': {
        const content = this.extractTextContent(event)
        if (content) {
          this.onOutput(agentId, {
            role: 'tool',
            contentType: 'text',
            content,
            metadata: event
          })
        }
        this.updateStatus(agentId, 'thinking')
        break
      }

      case 'result': {
        this.updateStatus(agentId, 'active')
        this.database.updateAgent(agentId, { currentTask: null })
        const content = this.extractTextContent(event)
        if (content) {
          this.onOutput(agentId, {
            role: 'agent',
            contentType: 'text',
            content,
            metadata: event
          })
        }
        break
      }

      case 'error': {
        const errMsg = (event.error as string) || (event.message as string) || 'Unknown error'
        if (errMsg.includes('already in use') || errMsg.includes('Session ID') && errMsg.includes('in use')) {
          this.updateStatus(agentId, 'session_conflict')
          this.onOutput(agentId, {
            role: 'system',
            contentType: 'error',
            content: 'This session is active in another terminal. Restart the agent to create a new session.',
            metadata: event
          })
        } else {
          this.updateStatus(agentId, 'error')
          this.onOutput(agentId, {
            role: 'system',
            contentType: 'error',
            content: errMsg,
            metadata: event
          })
        }
        break
      }

      default: {
        // Unknown event types — log as system message
        this.onOutput(agentId, {
          role: 'system',
          contentType: 'text',
          content: JSON.stringify(event),
          metadata: event
        })
      }
    }
  }

  private extractTextContent(event: Record<string, unknown>): string {
    // Handle various content formats from Claude CLI
    const content = event.content
    if (typeof content === 'string') return content

    if (Array.isArray(content)) {
      return (content as Array<Record<string, unknown>>)
        .filter((block) => block.type === 'text')
        .map((block) => block.text as string)
        .join('\n')
    }

    const message = event.message || event.text || event.result
    if (typeof message === 'string') return message

    return ''
  }

  private updateStatus(agentId: string, status: AgentStatus): void {
    this.database.updateAgent(agentId, { status })
    this.onStatusChange(agentId, status)
  }
}
