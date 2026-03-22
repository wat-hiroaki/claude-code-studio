import { ipcMain } from 'electron'
import type { Database } from '@main/database'
import { scanWorkspaces, scanRemoteWorkspaces } from '@main/workspaceScanner'
import { readWorkspaceConfig, readGlobalSkills } from '@main/config'

interface WorkspaceHandlerDeps {
  database: Database
}

export function registerWorkspaceHandlers(deps: WorkspaceHandlerDeps): void {
  const { database } = deps

  ipcMain.handle('workspace:create', (_event, params: unknown) => {
    const p = params as Record<string, unknown>
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid params')
    if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('name is required')
    const connectionType = p.connectionType === 'ssh' ? 'ssh' as const : 'local' as const
    const validated: import('@shared/types').CreateWorkspaceParams = {
      name: p.name,
      connectionType,
      ...(typeof p.color === 'string' ? { color: p.color } : {}),
      ...(connectionType === 'ssh' && p.sshConfig && typeof p.sshConfig === 'object' ? { sshConfig: p.sshConfig as import('@shared/types').CreateWorkspaceParams['sshConfig'] } : {}),
      ...(Array.isArray(p.projects) ? { projects: p.projects as { path: string; name: string }[] } : {})
    }
    return database.createWorkspace(validated)
  })

  ipcMain.handle('workspace:addProject', (_event, workspaceId: string, project: { path: string; name: string }) => {
    if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')
    if (!project || typeof project.path !== 'string' || !project.path.trim()) throw new Error('project path is required')
    return database.addProjectToWorkspace(workspaceId, {
      path: project.path.trim(),
      name: (project.name || '').trim()
    })
  })

  ipcMain.handle('workspace:removeProject', (_event, workspaceId: string, projectPath: string) => {
    if (typeof workspaceId !== 'string') throw new Error('Invalid workspace ID')
    if (typeof projectPath !== 'string') throw new Error('Invalid project path')
    return database.removeProjectFromWorkspace(workspaceId, projectPath)
  })

  ipcMain.handle('workspace:list', () => {
    return database.getWorkspaces()
  })

  ipcMain.handle('workspace:update', (_event, id: string, updates: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid workspace ID')
    return database.updateWorkspace(id, updates as Partial<import('@shared/types').Workspace>)
  })

  ipcMain.handle('workspace:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid workspace ID')
    database.deleteWorkspace(id)
  })

  ipcMain.handle('workspace:setActive', (_event, id: unknown) => {
    database.setActiveWorkspace(id === null ? null : String(id))
  })

  // SSH test connection
  ipcMain.handle('ssh:test', async (_event, config: Record<string, unknown>) => {
    const { Client } = await import('ssh2')
    const { readFileSync } = await import('fs')

    return new Promise<{ success: boolean; message: string }>((resolve) => {
      const client = new Client()
      const timeout = setTimeout(() => {
        client.end()
        resolve({ success: false, message: 'Connection timed out' })
      }, 10000)

      client.on('ready', () => {
        clearTimeout(timeout)
        client.exec('which tmux && which claude && echo "OK"', (err, stream) => {
          if (err) {
            client.end()
            resolve({ success: true, message: 'Connected (could not check prerequisites)' })
            return
          }
          let output = ''
          stream.on('data', (data: Buffer) => { output += data.toString() })
          stream.on('close', () => {
            client.end()
            const hasTmux = output.includes('tmux')
            const hasClaude = output.includes('claude')
            const ok = output.includes('OK')
            if (ok) {
              resolve({ success: true, message: 'Connected. tmux and claude found.' })
            } else {
              const missing: string[] = []
              if (!hasTmux) missing.push('tmux')
              if (!hasClaude) missing.push('claude')
              resolve({ success: true, message: `Connected. Missing: ${missing.join(', ')}` })
            }
          })
        })
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        resolve({ success: false, message: err.message })
      })

      const connectConfig: Record<string, unknown> = {
        host: String(config.host || ''),
        port: Number(config.port || 22),
        username: String(config.username || ''),
        readyTimeout: 10000
      }
      if (config.privateKeyPath) {
        try {
          const keyPath = String(config.privateKeyPath).replace(/\\/g, '/')
          connectConfig.privateKey = readFileSync(keyPath)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          resolve({ success: false, message: `Cannot read key: ${config.privateKeyPath} (${msg})` })
          return
        }
      }
      client.connect(connectConfig)
    })
  })

  // Workspace scanner
  ipcMain.handle('workspace:scan', async (_event, rootPath: string) => {
    if (typeof rootPath !== 'string' || !rootPath.trim()) {
      throw new Error('rootPath is required')
    }
    return scanWorkspaces(rootPath.trim())
  })

  ipcMain.handle('workspace:scan-remote', async (_event, sshConfig: { host: string; port: number; username: string; privateKeyPath?: string }, rootPath: string) => {
    if (!sshConfig || typeof sshConfig.host !== 'string') {
      throw new Error('Valid SSH config is required')
    }
    if (typeof rootPath !== 'string' || !rootPath.trim()) {
      throw new Error('rootPath is required')
    }
    return scanRemoteWorkspaces(sshConfig, rootPath.trim())
  })

  // Workspace config
  ipcMain.handle('workspace:config', (_event, workspacePath: string) => {
    if (typeof workspacePath !== 'string') throw new Error('Invalid workspace path')
    return readWorkspaceConfig(workspacePath)
  })

  ipcMain.handle('workspace:globalSkills', () => {
    return readGlobalSkills()
  })
}
