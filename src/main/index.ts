import { app, shell, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SessionManager } from './session-manager'
import { PtySessionManager } from './pty-session-manager'
import { Database } from './database'
import { ChainOrchestrator } from './chain-orchestrator'
import { scanWorkspaces } from './workspace-scanner'
import { readAgentProfile, readFileContent } from './claude-config-reader'
import { SshSessionManager } from './ssh-session-manager'
import type { CreateAgentParams } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sessionManager: SessionManager
let ptySessionManager: PtySessionManager
let sshSessionManager: SshSessionManager
let database: Database
let chainOrchestrator: ChainOrchestrator

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e0e0e0',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch { /* invalid URL, ignore */ }
    return { action: 'deny' }
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTrayIcon(): nativeImage {
  // Generate a simple programmatic icon (16x16 circle)
  const size = 16
  const canvas = Buffer.alloc(size * size * 4) // RGBA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5
      const cy = size / 2 - 0.5
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const idx = (y * size + x) * 4

      if (dist < size / 2 - 1) {
        // Inner circle — primary brand color
        canvas[idx] = 99      // R
        canvas[idx + 1] = 102 // G
        canvas[idx + 2] = 241 // B (indigo-ish)
        canvas[idx + 3] = 255 // A
      } else if (dist < size / 2) {
        // Anti-alias edge
        canvas[idx] = 99
        canvas[idx + 1] = 102
        canvas[idx + 2] = 241
        canvas[idx + 3] = 128
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function createTray(): void {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Claude Code Desktop')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow?.show()
  })
}

function setupIPC(): void {
  // Agent management
  ipcMain.handle('agent:create', async (_event, params: CreateAgentParams) => {
    // Validate required fields
    if (!params.name?.trim() || !params.projectPath?.trim() || !params.projectName?.trim()) {
      throw new Error('name, projectPath, and projectName are required')
    }
    const agent = database.createAgent(params)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      // PTY mode: session will be started by PtyTerminalView via pty:start
      database.updateAgent(agent.id, { status: 'idle' })
    } else {
      await sessionManager.startSession(agent)
    }
    return database.getAgent(agent.id)
  })

  ipcMain.handle('agent:list', () => {
    return database.getAgents()
  })

  ipcMain.handle('agent:get', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    return database.getAgent(id)
  })

  ipcMain.handle('agent:update', (_event, id: string, updates: Record<string, unknown>) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    return database.updateAgent(id, updates)
  })

  ipcMain.handle('agent:archive', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      ptySessionManager.stopSession(id)
    } else {
      await sessionManager.stopSession(id)
    }
    database.updateAgent(id, { status: 'archived' })
  })

  // Messaging
  ipcMain.handle('message:send', async (_event, agentId: string, content: string) => {
    if (typeof agentId !== 'string' || typeof content !== 'string') {
      throw new Error('Invalid message parameters')
    }
    database.addMessage(agentId, 'manager', 'text', content)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      ptySessionManager.writeInput(agentId, content + '\n')
    } else {
      await sessionManager.sendInput(agentId, content)
    }
  })

  ipcMain.handle('message:list', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    return database.getMessages(agentId)
  })

  // Agent control
  ipcMain.handle('agent:restart', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(id)
    if (agent) {
      const { usePtyMode } = database.getSettings()
      if (usePtyMode) {
        ptySessionManager.stopSession(id)
        await ptySessionManager.startSession(agent)
      } else {
        await sessionManager.stopSession(id)
        await sessionManager.startSession(agent)
      }
    }
  })

  ipcMain.handle('agent:interrupt', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      ptySessionManager.interruptSession(id)
    } else {
      await sessionManager.interruptSession(id)
    }
  })

  // Broadcast — send in parallel
  ipcMain.handle('broadcast:send', async (_event, agentIds: string[], message: string) => {
    if (!Array.isArray(agentIds) || typeof message !== 'string') {
      throw new Error('Invalid broadcast parameters')
    }
    const broadcastId = database.createBroadcast(message, agentIds)
    const { usePtyMode } = database.getSettings()
    await Promise.all(agentIds.map(async (agentId) => {
      database.addMessage(agentId, 'manager', 'text', message)
      if (usePtyMode) {
        ptySessionManager.writeInput(agentId, message + '\n')
      } else {
        await sessionManager.sendInput(agentId, message)
      }
    }))
    database.updateBroadcast(broadcastId, { status: 'sent' })
    return broadcastId
  })

  // Task chains
  ipcMain.handle('chain:create', (_event, chain: Record<string, unknown>) => {
    if (
      typeof chain?.name !== 'string' || !chain.name.trim() ||
      typeof chain?.triggerAgentId !== 'string' ||
      typeof chain?.targetAgentId !== 'string' ||
      typeof chain?.messageTemplate !== 'string'
    ) {
      throw new Error('Invalid chain parameters: name, triggerAgentId, targetAgentId, and messageTemplate are required')
    }
    return database.createChain(chain)
  })

  ipcMain.handle('chain:list', () => {
    return database.getChains()
  })

  ipcMain.handle('chain:update', (_event, id: string, updates) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    return database.updateChain(id, updates)
  })

  ipcMain.handle('chain:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    return database.deleteChain(id)
  })

  // Teams
  ipcMain.handle('team:create', (_event, name: string, color: string) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Team name is required')
    return database.createTeam(name.trim(), color || '#6366f1')
  })

  ipcMain.handle('team:list', () => {
    return database.getTeams()
  })

  ipcMain.handle('team:update', (_event, id: string, updates: Record<string, unknown>) => {
    if (typeof id !== 'string') throw new Error('Invalid team ID')
    return database.updateTeam(id, updates)
  })

  ipcMain.handle('team:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid team ID')
    return database.deleteTeam(id)
  })

  // Team stats
  ipcMain.handle('team:stats', () => {
    return database.getTeamStats()
  })

  // Dialog
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) throw new Error('No window available')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // App
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  // Workspaces
  ipcMain.handle('workspace:create', (_event, params: unknown) => {
    const p = params as Record<string, unknown>
    if (!p.name || typeof p.name !== 'string') throw new Error('name is required')
    return database.createWorkspace(p as import('@shared/types').CreateWorkspaceParams)
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
        // Check for tmux and claude
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
              const missing = []
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
          connectConfig.privateKey = readFileSync(String(config.privateKeyPath))
        } catch {
          resolve({ success: false, message: `Cannot read key: ${config.privateKeyPath}` })
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

  // Agent Profile
  ipcMain.handle('agent:profile', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    return readAgentProfile(agent.projectPath)
  })

  ipcMain.handle('agent:readFile', (_event, filePath: string) => {
    if (typeof filePath !== 'string') throw new Error('Invalid file path')
    // Security: only allow reading .md, .json, .yml files in claude config dirs
    if (!/\.(md|json|yml|yaml|txt)$/i.test(filePath)) {
      throw new Error('Only text/config files can be read')
    }
    return readFileContent(filePath)
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return database.getSettings()
  })

  ipcMain.handle('settings:update', (_event, updates: Record<string, unknown>) => {
    return database.updateSettings(updates)
  })

  ipcMain.handle('app:titlebar-theme', (_event, isDark: boolean) => {
    if (!mainWindow) return
    mainWindow.setTitleBarOverlay({
      color: isDark ? '#1a1a2e' : '#ffffff',
      symbolColor: isDark ? '#e0e0e0' : '#333333'
    })
  })
}

// Extend app type for isQuitting flag
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.wat-hiroaki.claude-code-desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  database = new Database()
  sessionManager = new SessionManager(database, (agentId, message) => {
    // Store parsed message in DB
    database.addMessage(agentId, message.role, message.contentType, message.content, message.metadata ?? undefined)
    // Send to renderer
    mainWindow?.webContents.send('agent:output', agentId, message)
    // Feed text output to chain orchestrator for keyword matching
    if (message.contentType === 'text' && message.role === 'agent') {
      chainOrchestrator.handleAgentOutput(agentId, message.content)
    }
  }, (agentId, status) => {
    mainWindow?.webContents.send('agent:status-change', agentId, status)
    // Feed status changes to chain orchestrator
    chainOrchestrator.handleStatusChange(agentId, status)
    // Show notification for important status changes
    if (status === 'awaiting' || status === 'error') {
      const agent = database.getAgent(agentId)
      if (agent) {
        const title = status === 'awaiting' ? 'Approval Required' : 'Error Occurred'
        const body = `${agent.name}: ${agent.currentTask || 'Check agent for details'}`
        new Notification({ title, body }).show()
        mainWindow?.webContents.send('notification', title, body)
      }
    }
  })

  ptySessionManager = new PtySessionManager(
    database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
    },
    (agentId, status) => {
      mainWindow?.webContents.send('agent:status-change', agentId, status)
      chainOrchestrator.handleStatusChange(agentId, status)
      if (status === 'awaiting' || status === 'error') {
        const agent = database.getAgent(agentId)
        if (agent) {
          const title = status === 'awaiting' ? 'Approval Required' : 'Error Occurred'
          const body = `${agent.name}: ${agent.currentTask || 'Check agent for details'}`
          new Notification({ title, body }).show()
          mainWindow?.webContents.send('notification', title, body)
        }
      }
    },
    (agentId, exitCode) => {
      mainWindow?.webContents.send('pty:exit', agentId, exitCode)
    }
  )

  sshSessionManager = new SshSessionManager(
    database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
    },
    (agentId, status) => {
      mainWindow?.webContents.send('agent:status-change', agentId, status)
      chainOrchestrator?.handleStatusChange(agentId, status)
      if (status === 'awaiting' || status === 'error') {
        const agent = database.getAgent(agentId)
        if (agent) {
          const title = status === 'awaiting' ? 'Approval Required' : 'Error Occurred'
          const body = `${agent.name}: ${agent.currentTask || 'Check agent for details'}`
          new Notification({ title, body }).show()
          mainWindow?.webContents.send('notification', title, body)
        }
      }
    },
    (agentId, exitCode) => {
      mainWindow?.webContents.send('pty:exit', agentId, exitCode)
    }
  )

  chainOrchestrator = new ChainOrchestrator(database, sessionManager)

  setupIPC()
  setupPtyIPC()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
  if (process.platform !== 'win32') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  sessionManager.stopAll()
  ptySessionManager.stopAll()
  sshSessionManager.stopAll()
  database.close()
})

function setupPtyIPC(): void {
  ipcMain.handle('pty:start', async (_event, agentId: string) => {
    if (typeof agentId !== 'string' || !agentId) throw new Error('Invalid agentId')
    // Skip if session already running
    if (ptySessionManager.hasSession(agentId)) return
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error(`Agent not found: ${agentId}`)
    await ptySessionManager.startSession(agent)
  })

  ipcMain.handle('pty:write', async (_event, agentId: string, data: string) => {
    if (typeof agentId !== 'string' || typeof data !== 'string') throw new Error('Invalid params')
    ptySessionManager.writeInput(agentId, data)
  })

  ipcMain.handle('pty:resize', async (_event, agentId: string, cols: number, rows: number) => {
    if (typeof agentId !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') {
      throw new Error('Invalid params')
    }
    ptySessionManager.resize(agentId, cols, rows)
  })

  ipcMain.handle('pty:interrupt', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    ptySessionManager.interruptSession(agentId)
  })

  ipcMain.handle('pty:stop', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    ptySessionManager.stopSession(agentId)
  })

  ipcMain.handle('pty:lastOutput', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    return ptySessionManager.getLastOutputLine(agentId)
  })
}
