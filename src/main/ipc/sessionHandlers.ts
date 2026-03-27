import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Database } from '@main/database'
import type { SessionManager } from '@main/sessionManager'
import type { PtySessionManager } from '@main/ptySessionManager'
import type { SshSessionManager } from '@main/sshSessionManager'
import type { CliSessionInfo } from '@shared/types'

interface SessionHandlerDeps {
  database: Database
  sessionManager: SessionManager
  ptySessionManager: PtySessionManager
  sshSessionManager: SshSessionManager
  getMainWindow: () => BrowserWindow | null
  isAgentSsh: (agentId: string) => boolean
  getAgentWorkspace: (agentId: string) => import('@shared/types').Workspace | null
}

export function registerSessionHandlers(deps: SessionHandlerDeps): void {
  const {
    database, sessionManager, ptySessionManager, sshSessionManager,
    isAgentSsh, getAgentWorkspace
  } = deps

  // PTY lifecycle
  ipcMain.handle('pty:start', async (_event, agentId: string) => {
    if (typeof agentId !== 'string' || !agentId) throw new Error('Invalid agentId')
    if (ptySessionManager.hasSession(agentId) || sshSessionManager.hasSession(agentId)) return
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error(`Agent not found: ${agentId}`)

    if (isAgentSsh(agentId)) {
      const workspace = getAgentWorkspace(agentId)
      if (!workspace) throw new Error('SSH workspace not found')
      await sshSessionManager.startSession(agent, workspace)
    } else {
      await ptySessionManager.startSession(agent)
    }
  })

  ipcMain.handle('pty:write', async (_event, agentId: string, data: string) => {
    if (typeof agentId !== 'string' || typeof data !== 'string') throw new Error('Invalid params')
    if (sshSessionManager.hasSession(agentId)) {
      sshSessionManager.writeInput(agentId, data)
    } else if (ptySessionManager.hasSession(agentId)) {
      ptySessionManager.writeInput(agentId, data)
    }
  })

  ipcMain.handle('pty:resize', async (_event, agentId: string, cols: number, rows: number) => {
    if (typeof agentId !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') {
      throw new Error('Invalid params')
    }
    if (sshSessionManager.hasSession(agentId)) {
      sshSessionManager.resize(agentId, cols, rows)
    } else {
      ptySessionManager.resize(agentId, cols, rows)
    }
  })

  ipcMain.handle('pty:interrupt', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    if (sshSessionManager.hasSession(agentId)) {
      sshSessionManager.interruptSession(agentId)
    } else {
      ptySessionManager.interruptSession(agentId)
    }
  })

  ipcMain.handle('pty:stop', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    if (sshSessionManager.hasSession(agentId)) {
      sshSessionManager.stopSession(agentId)
    } else {
      ptySessionManager.stopSession(agentId)
    }
  })

  ipcMain.handle('pty:lastOutput', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    if (sshSessionManager.hasSession(agentId)) {
      return sshSessionManager.getLastOutputLine(agentId)
    }
    return ptySessionManager.getLastOutputLine(agentId)
  })

  ipcMain.handle('pty:scrollback', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    return ptySessionManager.getScrollback(agentId)
  })

  // Session conflict resolution
  ipcMain.handle('pty:resolveConflict', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    await ptySessionManager.resolveSessionConflict(agentId)
  })

  // CLI session discovery
  ipcMain.handle('session:list', async () => {
    const claudePath = (sessionManager as any)['claudePath'] ?? 'claude'
    try {
      const { execFile: execFileCb } = await import('child_process')
      return new Promise<CliSessionInfo[]>((resolve) => {
        const useShell = process.platform === 'win32'
        execFileCb(claudePath, ['session', 'list', '--format', 'json'], { shell: useShell, timeout: 10000 }, (err, stdout) => {
          if (err || !stdout.trim()) {
            resolve([])
            return
          }
          try {
            const sessions = JSON.parse(stdout.trim())
            if (Array.isArray(sessions)) {
              resolve(sessions.map((s: Record<string, unknown>) => ({
                sessionId: String(s.session_id ?? s.sessionId ?? s.id ?? ''),
                projectPath: String(s.project_path ?? s.projectPath ?? s.cwd ?? ''),
                model: String(s.model ?? ''),
                createdAt: String(s.created_at ?? s.createdAt ?? ''),
                lastActiveAt: String(s.last_active_at ?? s.lastActiveAt ?? s.updated_at ?? '')
              })))
            } else {
              resolve([])
            }
          } catch {
            resolve([])
          }
        })
      })
    } catch {
      return []
    }
  })

  ipcMain.handle('session:attach', async (_event, agentId: string, sessionId: string) => {
    if (typeof agentId !== 'string' || typeof sessionId !== 'string') throw new Error('Invalid parameters')
    database.updateAgent(agentId, { claudeSessionId: sessionId })
  })

  // Memory monitoring
  ipcMain.handle('memory:poll', async () => {
    return ptySessionManager.pollMemoryUsage()
  })
}
