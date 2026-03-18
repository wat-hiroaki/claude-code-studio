import { app, shell, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SessionManager } from './session-manager'
import { PtySessionManager } from './pty-session-manager'
import { Database } from './database'
import { ChainOrchestrator } from './chain-orchestrator'
import { scanWorkspaces, scanRemoteWorkspaces } from './workspace-scanner'
import { readAgentProfile, readFileContent, readWorkspaceConfig, readGlobalSkills, readAgentTeamsData, readConfigMapData, readAllWorkspacesSummary } from './claude-config-reader'
import { ChainScheduler } from './scheduler'
import { SshSessionManager } from './ssh-session-manager'
import { initMainI18n, t } from './i18n'
import { DiagnosticsEngine } from './diagnostics'
import type { CreateAgentParams, CliSessionInfo } from '@shared/types'

// Track previous status per agent to detect task completion (thinking/tool_running → active)
const prevAgentStatus = new Map<string, string>()

// --- PTY → agent:output parser ---
// Debounce per-agent to avoid flooding renderer with events
const ptyParseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const ptyParseBuffers = new Map<string, string>()

function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

function parsePtyDataForActivityStream(agentId: string, rawData: string): void {
  // Accumulate data in a short buffer per agent
  const existing = ptyParseBuffers.get(agentId) ?? ''
  ptyParseBuffers.set(agentId, (existing + rawData).slice(-1000))

  // Debounce: emit at most every 300ms per agent
  if (ptyParseTimers.has(agentId)) return
  ptyParseTimers.set(agentId, setTimeout(() => {
    ptyParseTimers.delete(agentId)
    const buffer = ptyParseBuffers.get(agentId) ?? ''
    ptyParseBuffers.set(agentId, '')

    const clean = stripAnsiCodes(buffer)
    if (!clean.trim()) return

    // Determine message type
    let contentType: string = 'text'
    let role: string = 'agent'
    let content = clean.trim().slice(0, 200)

    const toolMatch = clean.match(/(?:Read|Write|Edit|Search|Bash|MultiTool|ListDir|Grep)\([^)]*\)/i)
    const errorMatch = clean.match(/(?:Error:|APIError|NetworkError|RateLimitError)[^\n]*/i)
    const toolUsesMatch = clean.match(/(\d+)\s+tool uses/i)

    if (toolMatch) {
      contentType = 'tool_exec'
      content = toolMatch[0].slice(0, 120)
    } else if (errorMatch) {
      contentType = 'error'
      content = errorMatch[0].slice(0, 120)
    } else if (toolUsesMatch) {
      contentType = 'tool_exec'
      content = `${toolUsesMatch[1]} tool uses`
    } else if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(buffer)) {
      // Spinner only — skip, it's just a thinking indicator
      return
    } else {
      // General text output — only emit if substantial
      const meaningful = clean.split('\n').map(l => l.trim()).filter(l => l.length > 3)
      if (meaningful.length === 0) return
      content = meaningful[meaningful.length - 1].slice(0, 200)
    }

    const message = { role, contentType, content, metadata: undefined }
    mainWindow?.webContents.send('agent:output', agentId, message)
  }, 300))
}

function sendNotification(agentId: string, type: 'awaiting' | 'error' | 'taskComplete'): void {
  const settings = database.getSettings()
  const ns = settings.notifications
  if (!ns.enabled) return
  if (type === 'awaiting' && !ns.approvalRequired) return
  if (type === 'error' && !ns.errors) return
  if (type === 'taskComplete' && !ns.taskComplete) return

  const agent = database.getAgent(agentId)
  if (!agent) return

  const titles: Record<string, string> = {
    awaiting: 'Approval Required',
    error: 'Error Occurred',
    taskComplete: 'Task Complete'
  }
  const title = titles[type]
  const body = `${agent.name}: ${agent.currentTask || (type === 'taskComplete' ? 'Ready for input' : 'Check agent for details')}`
  new Notification({ title, body }).show()
  mainWindow?.webContents.send('notification', title, body)
}

// Debounce notification per agent: suppress repeated same-type notifications within window
const notificationTimers = new Map<string, ReturnType<typeof setTimeout>>()
const NOTIFICATION_DEBOUNCE_MS = 30000

function debouncedNotification(agentId: string, type: 'awaiting' | 'error' | 'taskComplete'): void {
  const key = `${agentId}:${type}`
  if (notificationTimers.has(key)) return // Already pending or recently sent

  // Skip OS notification if window is focused (only send in-app toast)
  if (mainWindow?.isFocused()) {
    mainWindow.webContents.send('notification',
      type === 'awaiting' ? 'Approval Required' : type === 'error' ? 'Error Occurred' : 'Task Complete',
      `${database.getAgent(agentId)?.name || 'Agent'}: Check agent for details`
    )
  } else {
    sendNotification(agentId, type)
  }
  notificationTimers.set(key, setTimeout(() => notificationTimers.delete(key), NOTIFICATION_DEBOUNCE_MS))
}

function handleStatusChangeWithNotification(agentId: string, status: string): void {
  mainWindow?.webContents.send('agent:status-change', agentId, status)
  chainOrchestrator?.handleStatusChange(agentId, status as any)
  updateTrayMenu()

  const prev = prevAgentStatus.get(agentId)
  prevAgentStatus.set(agentId, status)

  if (status === 'awaiting') {
    debouncedNotification(agentId, 'awaiting')
  } else if (status === 'error') {
    sendNotification(agentId, 'error')
    diagnostics?.error('session', `Agent entered error state`, { agentId })
  } else if (status === 'session_conflict') {
    diagnostics?.warn('session', `Session conflict detected`, { agentId })
  } else if (status === 'active' && (prev === 'thinking' || prev === 'tool_running')) {
    debouncedNotification(agentId, 'taskComplete')
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sessionManager: SessionManager
let ptySessionManager: PtySessionManager
let sshSessionManager: SshSessionManager
let database: Database
let chainOrchestrator: ChainOrchestrator
let chainScheduler: ChainScheduler
let diagnostics: DiagnosticsEngine | null = null
let agentTeamsTimer: ReturnType<typeof setInterval> | null = null

function createWindow(): void {
  const settings = database.getSettings()
  const bounds = settings.windowBounds

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
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
      contextIsolation: true,
      webviewTag: true
    }
  })

  if (bounds?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window bounds on resize/move
  const saveWindowBounds = (): void => {
    if (!mainWindow) return
    const isMaximized = mainWindow.isMaximized()
    const windowBounds = isMaximized ? settings.windowBounds : { ...mainWindow.getBounds(), isMaximized: false }
    if (windowBounds) {
      database.updateSettings({ windowBounds: { ...windowBounds, isMaximized } })
    }
  }
  mainWindow.on('resize', saveWindowBounds)
  mainWindow.on('move', saveWindowBounds)
  mainWindow.on('maximize', saveWindowBounds)
  mainWindow.on('unmaximize', saveWindowBounds)

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
    if (!(app as any).isQuitting) {
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

function createTrayIcon(): Electron.NativeImage {
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
  tray.setToolTip('Claude Code Studio')
  updateTrayMenu()

  tray.on('click', () => {
    mainWindow?.show()
  })
}

function updateTrayMenu(): void {
  if (!tray) return
  const stats = database.getTeamStats()
  const contextMenu = Menu.buildFromTemplate([
    { label: t('tray.status').replace('{{active}}', String(stats.active)).replace('{{error}}', String(stats.error)), enabled: false },
    { type: 'separator' },
    { label: t('tray.showWindow'), click: () => mainWindow?.show() },
    { label: t('tray.dashboard'), click: () => {
      mainWindow?.show()
      mainWindow?.webContents.send('notification', 'Dashboard', 'Toggle dashboard from tray')
    }},
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        ;(app as any).isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

// Determine if an agent's workspace uses SSH
function isAgentSsh(agentId: string): boolean {
  const agent = database.getAgent(agentId)
  if (!agent?.workspaceId) return false
  const workspace = database.getWorkspaces().find((w) => w.id === agent.workspaceId)
  return workspace?.connectionType === 'ssh'
}

// Get workspace for an agent (for SSH sessions)
function getAgentWorkspace(agentId: string): import('@shared/types').Workspace | null {
  const agent = database.getAgent(agentId)
  if (!agent?.workspaceId) return null
  return database.getWorkspaces().find((w) => w.id === agent.workspaceId) ?? null
}

function setupIPC(): void {
  // Agent management
  ipcMain.handle('agent:create', async (_event, params: CreateAgentParams) => {
    // Validate required fields
    if (!params.name?.trim() || !params.projectName?.trim()) {
      throw new Error('name and projectName are required')
    }
    // projectPath is optional for SSH workspaces (remote path, can't validate locally)
    const agent = database.createAgent(params)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      // PTY mode: session will be started by PtyTerminalView via pty:start
      database.updateAgent(agent.id, { status: 'idle' })
    } else if (isAgentSsh(agent.id)) {
      // SSH agents in non-PTY mode: set idle, cannot start local session
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
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Invalid updates: must be an object')
    }
    const ALLOWED_AGENT_KEYS = new Set([
      'name', 'icon', 'roleLabel', 'workspaceId', 'projectPath', 'projectName',
      'sessionNumber', 'status', 'currentTask', 'systemPrompt', 'claudeSessionId',
      'isPinned', 'skills', 'teamId', 'reportTo', 'parentAgentId', 'isTemporary'
    ])
    const sanitized: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) {
      if (ALLOWED_AGENT_KEYS.has(key)) {
        sanitized[key] = updates[key]
      }
    }
    return database.updateAgent(id, sanitized)
  })

  ipcMain.handle('agent:archive', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(id)) {
        sshSessionManager.stopSession(id)
      } else {
        ptySessionManager.stopSession(id)
      }
    } else {
      await sessionManager.stopSession(id)
    }
    database.updateAgent(id, { status: 'archived' })
    // Notify renderer so UI removes the agent from the list
    mainWindow?.webContents.send('agent:status-change', id, 'archived')
  })

  ipcMain.handle('agent:unarchive', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    database.updateAgent(id, { status: 'idle' })
    mainWindow?.webContents.send('agent:status-change', id, 'idle')
  })

  // Messaging
  ipcMain.handle('message:send', async (_event, agentId: string, content: string) => {
    if (typeof agentId !== 'string' || typeof content !== 'string') {
      throw new Error('Invalid message parameters')
    }
    database.addMessage(agentId, 'manager', 'text', content)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(agentId)) {
        sshSessionManager.writeInput(agentId, content + '\n')
      } else {
        ptySessionManager.writeInput(agentId, content + '\n')
      }
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
        // Stop existing session
        if (sshSessionManager.hasSession(id)) {
          sshSessionManager.stopSession(id)
        } else if (ptySessionManager.hasSession(id)) {
          ptySessionManager.stopSession(id)
        }
        // Restart based on workspace type (not current session type)
        if (isAgentSsh(id)) {
          const workspace = getAgentWorkspace(id)
          if (workspace) {
            await sshSessionManager.startSession(agent, workspace)
          }
        } else {
          await ptySessionManager.startSession(agent)
        }
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
      if (sshSessionManager.hasSession(id)) {
        sshSessionManager.interruptSession(id)
      } else {
        ptySessionManager.interruptSession(id)
      }
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
        if (sshSessionManager.hasSession(agentId)) {
          sshSessionManager.writeInput(agentId, message + '\n')
        } else {
          ptySessionManager.writeInput(agentId, message + '\n')
        }
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
    const tc = chain.triggerCondition
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
      throw new Error('Invalid chain parameters: triggerCondition must be an object with a type field')
    }
    const tcObj = tc as Record<string, unknown>
    const validConditionTypes = ['complete', 'keyword', 'no_error', 'scheduled']
    if (typeof tcObj.type !== 'string' || !validConditionTypes.includes(tcObj.type)) {
      throw new Error('Invalid chain parameters: triggerCondition.type must be one of: complete, keyword, no_error, scheduled')
    }
    const triggerCondition: import('@shared/types').TaskChain['triggerCondition'] = {
      type: tcObj.type as 'complete' | 'keyword' | 'no_error' | 'scheduled',
      ...(typeof tcObj.keyword === 'string' ? { keyword: tcObj.keyword } : {}),
      ...(typeof tcObj.cronExpression === 'string' ? { cronExpression: tcObj.cronExpression } : {}),
      ...(typeof tcObj.intervalMinutes === 'number' ? { intervalMinutes: tcObj.intervalMinutes } : {})
    }
    const validatedChain: Omit<import('@shared/types').TaskChain, 'id' | 'createdAt'> = {
      name: chain.name,
      triggerAgentId: chain.triggerAgentId,
      targetAgentId: chain.targetAgentId,
      messageTemplate: chain.messageTemplate,
      triggerCondition,
      onError: chain.onError === 'skip' || chain.onError === 'notify_only' ? chain.onError : 'stop',
      isActive: typeof chain.isActive === 'boolean' ? chain.isActive : true
    }
    const created = database.createChain(validatedChain)
    chainScheduler?.syncJobs()
    return created
  })

  ipcMain.handle('chain:list', () => {
    return database.getChains()
  })

  ipcMain.handle('chain:update', (_event, id: string, updates) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    const updated = database.updateChain(id, updates)
    chainScheduler?.syncJobs()
    return updated
  })

  ipcMain.handle('chain:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    chainScheduler?.removeJob(id)
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

  // Tasks
  ipcMain.handle('task:create', (_event, title: string, description?: string, status?: import('@shared/types').TaskStatus, agentId?: string) => {
    if (typeof title !== 'string' || !title.trim()) throw new Error('Task title is required')
    return database.createTask(title.trim(), description, status, agentId)
  })

  ipcMain.handle('task:list', () => {
    return database.getTasks()
  })

  ipcMain.handle('task:update', (_event, id: string, updates: Partial<import('@shared/types').Task>) => {
    if (typeof id !== 'string') throw new Error('Invalid task ID')
    return database.updateTask(id, updates)
  })

  ipcMain.handle('task:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid task ID')
    return database.deleteTask(id)
  })

  // Prompt Templates
  ipcMain.handle('template:create', (_event, template: { label: string; value: string; category: string }) => {
    if (!template?.label?.trim()) throw new Error('Template label is required')
    return database.createTemplate({ label: template.label.trim(), value: template.value, category: template.category })
  })

  ipcMain.handle('template:list', () => {
    return database.getTemplates()
  })

  ipcMain.handle('template:update', (_event, id: string, updates: Partial<import('@shared/types').PromptTemplate>) => {
    if (typeof id !== 'string') throw new Error('Invalid template ID')
    return database.updateTemplate(id, updates)
  })

  ipcMain.handle('template:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid template ID')
    return database.deleteTemplate(id)
  })

  // Team stats
  ipcMain.handle('team:stats', () => {
    return database.getTeamStats()
  })

  // Memory monitoring
  ipcMain.handle('memory:poll', async () => {
    return ptySessionManager.pollMemoryUsage()
  })

  // Memory monitor timer (every 30s) — cleared on app quit
  const memoryMonitorTimer = setInterval(async () => {
    if (!mainWindow) return
    try {
      const memInfo = await ptySessionManager.pollMemoryUsage()
      if (memInfo.length === 0) return

      mainWindow.webContents.send('memory:update', memInfo)

      const settings = database.getSettings()
      const threshold = settings.memoryThresholdMB || 2048

      for (const info of memInfo) {
        if (info.memoryMB > threshold) {
          const agent = database.getAgent(info.agentId)
          if (!agent) continue

          if (settings.autoRestartOnMemoryExceeded && (agent.status === 'idle' || agent.status === 'active')) {
            // Safe auto-restart: only idle/active agents
            console.warn(`[MemoryMonitor] Agent ${agent.name} exceeded ${threshold}MB (${info.memoryMB}MB). Auto-restarting.`)
            ptySessionManager.stopSession(info.agentId)
            database.updateAgent(info.agentId, { status: 'idle' })
            handleStatusChangeWithNotification(info.agentId, 'idle')
            // Restart after brief delay
            setTimeout(async () => {
              const freshAgent = database.getAgent(info.agentId)
              if (freshAgent) {
                await ptySessionManager.startSession(freshAgent)
                mainWindow?.webContents.send('notification', 'Memory Auto-Restart', `${agent.name}: restarted due to high memory (${info.memoryMB}MB)`)
              }
            }, 1000)
          } else {
            // Warning only
            mainWindow.webContents.send('notification', 'Memory Warning', `${agent.name}: ${info.memoryMB}MB (threshold: ${threshold}MB)`)
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, 30000)

  // Agent Teams polling timer (every 15s) — cleared on app quit
  let prevAgentTeamsJson = ''
  agentTeamsTimer = setInterval(() => {
    if (!mainWindow) return
    try {
      const data = readAgentTeamsData()
      const json = JSON.stringify(data.taskSessions)
      if (json !== prevAgentTeamsJson) {
        prevAgentTeamsJson = json
        mainWindow.webContents.send('agentTeams:update', data)
      }
    } catch {
      // Ignore polling errors
    }
  }, 15000)

  // Dialog
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) throw new Error('No window available')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    if (!mainWindow) throw new Error('No window available')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // Config files (B-1 to B-4)
  ipcMain.handle('config:getMcp', async (_event, scope: string, projectPath?: string) => {
    const { existsSync, readFileSync } = await import('fs')
    const { homedir } = await import('os')
    let configPath: string
    if (scope === 'project' && projectPath) {
      configPath = join(projectPath, '.mcp.json')
    } else {
      configPath = join(homedir(), '.claude', 'settings.json')
    }
    if (!existsSync(configPath)) return { mcpServers: {} }
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { mcpServers: raw.mcpServers ?? {} }
    } catch {
      return { mcpServers: {} }
    }
  })

  ipcMain.handle('config:updateMcp', async (_event, scope: string, config: { mcpServers: Record<string, unknown> }, projectPath?: string) => {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs')
    const { homedir } = await import('os')
    const { dirname } = await import('path')
    let configPath: string
    if (scope === 'project' && projectPath) {
      if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`)
      }
      configPath = join(projectPath, '.mcp.json')
    } else {
      configPath = join(homedir(), '.claude', 'settings.json')
    }
    let existing: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try { existing = JSON.parse(readFileSync(configPath, 'utf-8')) } catch { /* ignore */ }
    }
    existing.mcpServers = config.mcpServers
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8')
  })

  ipcMain.handle('config:getClaudeMd', async (_event, projectPath: string) => {
    const { existsSync, readFileSync } = await import('fs')
    const mdPath = join(projectPath, 'CLAUDE.md')
    if (!existsSync(mdPath)) return ''
    return readFileSync(mdPath, 'utf-8')
  })

  ipcMain.handle('config:saveClaudeMd', async (_event, projectPath: string, content: string) => {
    const { writeFileSync } = await import('fs')
    if (!existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`)
    }
    const mdPath = join(projectPath, 'CLAUDE.md')
    writeFileSync(mdPath, content, 'utf-8')
  })

  ipcMain.handle('config:getPermissions', async () => {
    const { existsSync, readFileSync } = await import('fs')
    const { homedir } = await import('os')
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return { allowedTools: [], deniedTools: [] }
    try {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return {
        allowedTools: raw.allowedTools ?? [],
        deniedTools: raw.deniedTools ?? []
      }
    } catch {
      return { allowedTools: [], deniedTools: [] }
    }
  })

  ipcMain.handle('config:updatePermissions', async (_event, permissions: { allowedTools: string[]; deniedTools: string[] }) => {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs')
    const { homedir } = await import('os')
    const { dirname } = await import('path')
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    let existing: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      try { existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { /* ignore */ }
    }
    existing.allowedTools = permissions.allowedTools
    existing.deniedTools = permissions.deniedTools
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2), 'utf-8')
  })

  // App
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  // Workspaces
  ipcMain.handle('workspace:create', (_event, params: unknown) => {
    const p = params as Record<string, unknown>
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid params')
    if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('name is required')
    if (typeof p.path !== 'string' || !p.path.trim()) throw new Error('path is required')
    const connectionType = p.connectionType === 'ssh' ? 'ssh' as const : 'local' as const
    const validated: import('@shared/types').CreateWorkspaceParams = {
      name: p.name,
      path: p.path,
      connectionType,
      ...(typeof p.color === 'string' ? { color: p.color } : {}),
      ...(connectionType === 'ssh' && p.sshConfig && typeof p.sshConfig === 'object' ? { sshConfig: p.sshConfig as import('@shared/types').CreateWorkspaceParams['sshConfig'] } : {})
    }
    return database.createWorkspace(validated)
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
          // Normalize path separators for Windows compatibility
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

  // Workspace config (人材管理)
  ipcMain.handle('workspace:config', (_event, workspacePath: string) => {
    if (typeof workspacePath !== 'string') throw new Error('Invalid workspace path')
    return readWorkspaceConfig(workspacePath)
  })

  ipcMain.handle('workspace:globalSkills', () => {
    return readGlobalSkills()
  })

  // Chain execution logs (勤怠管理)
  ipcMain.handle('chain:executionLogs', (_event, limit?: number) => {
    return database.getChainExecutionLogs(limit)
  })

  ipcMain.handle('chain:scheduled', () => {
    return database.getScheduledChains()
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return database.getSettings()
  })

  ipcMain.handle('settings:update', (_event, updates: Record<string, unknown>) => {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Invalid settings updates')
    }
    const validated: Partial<import('@shared/types').AppSettings> = {}
    if ('usePtyMode' in updates && typeof updates.usePtyMode === 'boolean') {
      validated.usePtyMode = updates.usePtyMode
    }
    if ('composerHeight' in updates && typeof updates.composerHeight === 'number') {
      validated.composerHeight = updates.composerHeight
    }
    if ('notifications' in updates && updates.notifications && typeof updates.notifications === 'object' && !Array.isArray(updates.notifications)) {
      const n = updates.notifications as Record<string, unknown>
      validated.notifications = {
        enabled: typeof n.enabled === 'boolean' ? n.enabled : true,
        taskComplete: typeof n.taskComplete === 'boolean' ? n.taskComplete : true,
        approvalRequired: typeof n.approvalRequired === 'boolean' ? n.approvalRequired : true,
        errors: typeof n.errors === 'boolean' ? n.errors : true
      }
    }
    return database.updateSettings(validated)
  })

  // Database backup/export
  ipcMain.handle('db:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `claude-code-studio-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Database Backup', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, database.exportData(), 'utf-8')
    return filePath
  })

  ipcMain.handle('db:path', () => {
    return database.getDbPath()
  })

  // Agent templates
  ipcMain.handle('agent:exportTemplate', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')
    const template: import('@shared/types').AgentTemplate = {
      name: agent.name,
      roleLabel: agent.roleLabel,
      systemPrompt: agent.systemPrompt,
      skills: agent.skills,
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion()
    }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${agent.name.replace(/\s+/g, '-').toLowerCase()}-template.json`,
      filters: [{ name: 'Agent Template', extensions: ['json'] }]
    })
    if (canceled || !filePath) return ''
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8')
    return filePath
  })

  ipcMain.handle('agent:importTemplate', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      filters: [{ name: 'Agent Template', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const { readFileSync } = await import('fs')
    try {
      const content = readFileSync(filePaths[0], 'utf-8')
      const template = JSON.parse(content) as import('@shared/types').AgentTemplate
      if (!template.name || !template.exportedAt) throw new Error('Invalid template format')
      return template
    } catch {
      throw new Error('Failed to parse agent template file')
    }
  })

  // Agent Definitions (saved profiles)
  ipcMain.handle('agentDef:list', async () => {
    return database.getAgentTemplates()
  })

  ipcMain.handle('agentDef:create', async (_event, params) => {
    return database.createAgentTemplate(params)
  })

  ipcMain.handle('agentDef:delete', async (_event, id: string) => {
    database.deleteAgentTemplate(id)
  })

  // CLI session discovery
  ipcMain.handle('session:list', async () => {
    const claudePath = sessionManager['claudePath'] ?? 'claude'
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

  ipcMain.handle('app:titlebar-theme', (_event, isDark: boolean) => {
    if (!mainWindow) return
    mainWindow.setTitleBarOverlay({
      color: isDark ? '#1a1a2e' : '#ffffff',
      symbolColor: isDark ? '#e0e0e0' : '#333333'
    })
  })
}

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
  diagnostics?.fatal('system', `Uncaught exception: ${err.message}`, {
    stack: err.stack,
    details: String(err)
  })
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('notification', 'Internal Error', err.message)
  }
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason)
  const msg = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : undefined
  diagnostics?.error('system', `Unhandled rejection: ${msg}`, { stack })
})

app.whenReady().then(() => {
  initMainI18n()
  electronApp.setAppUserModelId('dev.wat-hiroaki.claude-code-studio')

  // 自動アップデート
  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', info.version ?? '')
    })

    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update:progress', Math.round(progress.percent))
    })

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', info.version ?? '')
    })

    autoUpdater.checkForUpdates()
  }

  // IPC: ユーザーが「今すぐ更新」を押した時
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  database = new Database()
  // Initialize diagnostics (opt-out: enabled by default, user can disable in Settings)
  const settings = database.getSettings()
  const diagEnabled = (settings as unknown as Record<string, unknown>).diagnosticsEnabled !== false
  diagnostics = new DiagnosticsEngine(diagEnabled)
  diagnostics.info('system', `App started, version ${app.getVersion()}`)

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
    handleStatusChangeWithNotification(agentId, status)
  })

  ptySessionManager = new PtySessionManager(
    database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
      chainOrchestrator?.handlePtyData(agentId, data)

      // Parse PTY raw data into structured agent:output events
      // so ActivityStream, ActivityLog, and Dashboard stats work in PTY mode
      try {
        parsePtyDataForActivityStream(agentId, data)
      } catch { /* non-critical, don't break PTY data flow */ }
    },
    (agentId, status) => {
      handleStatusChangeWithNotification(agentId, status)
    },
    (agentId, exitCode) => {
      mainWindow?.webContents.send('pty:exit', agentId, exitCode)
    }
  )

  sshSessionManager = new SshSessionManager(
    database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
      chainOrchestrator?.handlePtyData(agentId, data)
    },
    (agentId, status) => {
      handleStatusChangeWithNotification(agentId, status)
    },
    (agentId, exitCode) => {
      mainWindow?.webContents.send('pty:exit', agentId, exitCode)
    }
  )

  chainOrchestrator = new ChainOrchestrator(
    database,
    async (agent) => {
      const { usePtyMode } = database.getSettings()
      if (usePtyMode) {
        if (isAgentSsh(agent.id)) {
          const workspace = getAgentWorkspace(agent.id)
          if (workspace) await sshSessionManager.startSession(agent, workspace)
        } else {
          await ptySessionManager.startSession(agent)
        }
      } else {
        await sessionManager.startSession(agent)
      }
    },
    async (agentId, message) => {
      const { usePtyMode } = database.getSettings()
      if (usePtyMode) {
        if (isAgentSsh(agentId)) {
          sshSessionManager.writeInput(agentId, message + '\n')
        } else {
          ptySessionManager.writeInput(agentId, message + '\n')
        }
      } else {
        await sessionManager.sendInput(agentId, message)
      }
    },
    (event) => {
      mainWindow?.webContents.send('chain:event', event)
    }
  )

  chainScheduler = new ChainScheduler(database, (chain) => {
    chainOrchestrator.executeScheduledChain(chain)
  })
  chainScheduler.start()

  setupIPC()
  setupPtyIPC()
  setupDiagnosticsIPC()
  createWindow()
  createTray()

  // Startup workspace path validation
  const workspaces = database.getWorkspaces()
  const invalidWorkspaces = workspaces.filter(ws =>
    ws.connectionType === 'local' && ws.path && !existsSync(ws.path)
  )
  if (invalidWorkspaces.length > 0) {
    // Wait a bit for window to be ready, then notify
    setTimeout(() => {
      mainWindow?.webContents.send('workspace:path-invalid', invalidWorkspaces.map(w => w.id))
    }, 2000)
  }

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
  ;(app as any).isQuitting = true
  clearInterval(memoryMonitorTimer)
  if (agentTeamsTimer) clearInterval(agentTeamsTimer)
  chainScheduler?.stop()
  sessionManager.stopAll()
  ptySessionManager.stopAll()
  sshSessionManager.stopAll()
  database.close()
})

function setupPtyIPC(): void {
  ipcMain.handle('pty:start', async (_event, agentId: string) => {
    if (typeof agentId !== 'string' || !agentId) throw new Error('Invalid agentId')
    // Skip if session already running (either local or SSH)
    if (ptySessionManager.hasSession(agentId) || sshSessionManager.hasSession(agentId)) return
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error(`Agent not found: ${agentId}`)

    // Route to SSH or local PTY based on workspace connection type
    if (isAgentSsh(agentId)) {
      const workspace = getAgentWorkspace(agentId)
      if (!workspace) throw new Error('SSH workspace not found')
      await sshSessionManager.startSession(agent, workspace)
    } else {
      // Only validate local paths (SSH paths are remote and can't be checked locally)
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
    // If no session exists for this agentId, silently ignore (session may have been destroyed)
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

  // Session conflict resolution — user explicitly chooses to recover
  ipcMain.handle('pty:resolveConflict', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agentId')
    await ptySessionManager.resolveSessionConflict(agentId)
  })
}

function setupDiagnosticsIPC(): void {
  ipcMain.handle('diagnostics:getLogs', (_event, limit?: number, level?: string, category?: string) => {
    if (!diagnostics) return []
    return diagnostics.getLogs(
      limit ?? 100,
      level as import('./diagnostics').LogLevel | undefined,
      category as import('./diagnostics').LogCategory | undefined
    )
  })

  ipcMain.handle('diagnostics:getStats', () => {
    if (!diagnostics) return { totalLogs: 0, errorCount: 0, warnCount: 0, fatalCount: 0, oldestLog: null, newestLog: null, logSizeBytes: 0 }
    return diagnostics.getStats()
  })

  ipcMain.handle('diagnostics:export', async () => {
    if (!diagnostics) return null
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `claude-code-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Diagnostic Logs', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, diagnostics.exportLogs(), 'utf-8')
    return filePath
  })

  ipcMain.handle('diagnostics:clear', () => {
    diagnostics?.clearLogs()
  })

  ipcMain.handle('diagnostics:setEnabled', (_event, enabled: boolean) => {
    if (diagnostics) {
      diagnostics.setEnabled(enabled)
    } else {
      diagnostics = new DiagnosticsEngine(enabled)
    }
    // Persist the setting
    database.updateSettings({ diagnosticsEnabled: enabled } as unknown as Partial<import('@shared/types').AppSettings>)
  })

  ipcMain.handle('diagnostics:isEnabled', () => {
    return diagnostics?.isEnabled() ?? false
  })

  // Config Map
  ipcMain.handle('config:getConfigMap', (_event, projectPath: string) => {
    return readConfigMapData(projectPath)
  })

  // Organization Overview: all workspaces summary
  ipcMain.handle('config:getOrgOverview', (_event, projectPaths: string[]) => {
    return readAllWorkspacesSummary(projectPaths)
  })

  // Hook execution logs
  ipcMain.handle('hook:getLogs', (_event, limit?: number, event?: string) => {
    return db.getHookExecutionLogs(limit ?? 50, event)
  })

  // Agent Teams (Claude Code CLI integration)
  ipcMain.handle('agentTeams:get', () => {
    return readAgentTeamsData()
  })

  // Window fullscreen
  ipcMain.handle('window:toggleFullscreen', () => {
    if (!mainWindow) return false
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
    return mainWindow.isFullScreen()
  })

  ipcMain.handle('window:isFullscreen', () => {
    return mainWindow?.isFullScreen() ?? false
  })
}
