import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AgentStatus } from '@shared/types'

// Fix Chromium/GTK warnings on Linux (driver-level, not fixable via packages)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu-vsync')
  process.env.G_DEBUG = 'none'
}

import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SessionManager } from './sessionManager'
import { PtySessionManager } from './ptySessionManager'
import { Database } from './database'
import { ChainOrchestrator } from './chainOrchestrator'
import { ChainScheduler } from './scheduler'
import { SshSessionManager } from './sshSessionManager'
import { initMainI18n } from './i18n'
import { DiagnosticsEngine } from './diagnostics'

import { registerAgentHandlers } from './ipc/agentHandlers'
import { registerSessionHandlers } from './ipc/sessionHandlers'
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers'
import { registerConfigHandlers } from './ipc/configHandlers'
import { registerSystemHandlers } from './ipc/systemHandlers'
import { PluginManager } from './plugins/pluginManager'
import { registerPluginHandlers } from './plugins/pluginIpcHandlers'

import { createWindow, createTray, updateTrayMenu } from './windowManager'
import { setupAppLifecycle } from './appLifecycle'
import { debouncedNotification } from './notificationHelper'
import { parsePtyDataForActivityStream, cleanupPtyParseState, ptyParseTimers, ptyParseBuffers } from './ptyOutputParser'

import type { Tray } from 'electron'

// ── Shared mutable state ──

const prevAgentStatus = new Map<string, string>()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sessionManager: SessionManager
let ptySessionManager: PtySessionManager
let sshSessionManager: SshSessionManager
let database: Database
let chainOrchestrator: ChainOrchestrator
let chainScheduler: ChainScheduler
let diagnostics: DiagnosticsEngine | null = null
let memoryMonitorTimer: ReturnType<typeof setInterval> | null = null
let agentTeamsTimer: ReturnType<typeof setInterval> | null = null

// ── Accessor helpers (passed to handler modules) ──

const getMainWindow = (): BrowserWindow | null => mainWindow

function isAgentSsh(agentId: string): boolean {
  const agent = database.getAgent(agentId)
  if (!agent?.workspaceId) return false
  const workspace = database.getWorkspaces().find((w) => w.id === agent.workspaceId)
  return workspace?.connectionType === 'ssh'
}

function getAgentWorkspace(agentId: string): import('@shared/types').Workspace | null {
  const agent = database.getAgent(agentId)
  if (!agent?.workspaceId) return null
  return database.getWorkspaces().find((w) => w.id === agent.workspaceId) ?? null
}

function handleStatusChangeWithNotification(agentId: string, status: string): void {
  mainWindow?.webContents.send('agent:status-change', agentId, status)
  chainOrchestrator?.handleStatusChange(agentId, status as AgentStatus)
  if (tray) updateTrayMenu(tray, database, getMainWindow)

  const prev = prevAgentStatus.get(agentId)
  prevAgentStatus.set(agentId, status)

  if (status === 'awaiting') {
    debouncedNotification(database, getMainWindow, agentId, 'awaiting')
  } else if (status === 'error') {
    debouncedNotification(database, getMainWindow, agentId, 'error')
    diagnostics?.error('session', `Agent entered error state`, { agentId })
  } else if (status === 'session_conflict') {
    diagnostics?.warn('session', `Session conflict detected`, { agentId })
  } else if (status === 'active' && (prev === 'thinking' || prev === 'tool_running')) {
    debouncedNotification(database, getMainWindow, agentId, 'taskComplete')
  }
}

// ── Global error handlers ──

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
  diagnostics?.fatal('system', `Uncaught exception: ${err.message}`, { stack: err.stack, details: String(err) })
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

// ── App bootstrap ──

app.whenReady().then(() => {
  initMainI18n()
  electronApp.setAppUserModelId('dev.wat-hiroaki.claude-code-studio')

  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', (info) => mainWindow?.webContents.send('update:available', info.version ?? ''))
    autoUpdater.on('download-progress', (progress) => mainWindow?.webContents.send('update:progress', Math.round(progress.percent)))
    autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update:downloaded', info.version ?? ''))
    autoUpdater.checkForUpdates()
  }

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  database = new Database()

  // Reset stale agent statuses from previous session
  for (const agent of database.getAgents()) {
    if (['active', 'thinking', 'tool_running', 'creating'].includes(agent.status)) {
      database.updateAgent(agent.id, { status: 'idle', claudeSessionId: null })
    }
  }

  const settings = database.getSettings()
  const diagEnabled = (settings as unknown as Record<string, unknown>).diagnosticsEnabled !== false
  diagnostics = new DiagnosticsEngine(diagEnabled)
  diagnostics.info('system', `App started, version ${app.getVersion()}`)

  // Initialize session managers
  sessionManager = new SessionManager(database, (agentId, message) => {
    database.addMessage(agentId, message.role, message.contentType, message.content, message.metadata ?? undefined)
    mainWindow?.webContents.send('agent:output', agentId, message)
    if (message.contentType === 'text' && message.role === 'agent') {
      chainOrchestrator.handleAgentOutput(agentId, message.content)
    }
  }, (agentId, status) => handleStatusChangeWithNotification(agentId, status))

  ptySessionManager = new PtySessionManager(database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
      chainOrchestrator?.handlePtyData(agentId, data)
      try { parsePtyDataForActivityStream(agentId, data, getMainWindow) } catch { /* non-critical */ }
    },
    (agentId, status) => handleStatusChangeWithNotification(agentId, status),
    (agentId, exitCode) => {
      cleanupPtyParseState(agentId)
      mainWindow?.webContents.send('pty:exit', agentId, exitCode)
    }
  )

  sshSessionManager = new SshSessionManager(database,
    (agentId, data) => {
      mainWindow?.webContents.send('pty:data', agentId, data)
      chainOrchestrator?.handlePtyData(agentId, data)
    },
    (agentId, status) => handleStatusChangeWithNotification(agentId, status),
    (agentId, exitCode) => mainWindow?.webContents.send('pty:exit', agentId, exitCode)
  )

  chainOrchestrator = new ChainOrchestrator(database,
    async (agent) => {
      const { usePtyMode } = database.getSettings()
      if (usePtyMode) {
        if (isAgentSsh(agent.id)) {
          const ws = getAgentWorkspace(agent.id)
          if (ws) await sshSessionManager.startSession(agent, ws)
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
        if (isAgentSsh(agentId)) sshSessionManager.writeInput(agentId, message + '\n')
        else ptySessionManager.writeInput(agentId, message + '\n')
      } else {
        await sessionManager.sendInput(agentId, message)
      }
    },
    (event) => mainWindow?.webContents.send('chain:event', event)
  )

  chainScheduler = new ChainScheduler(database, (chain) => chainOrchestrator.executeScheduledChain(chain))
  chainScheduler.start()

  // Register all IPC handlers
  registerAgentHandlers({
    database, sessionManager, ptySessionManager, sshSessionManager,
    getMainWindow, isAgentSsh, getAgentWorkspace,
    handleStatusChangeWithNotification, ptyParseTimers, ptyParseBuffers
  })
  registerSessionHandlers({ database, sessionManager, ptySessionManager, sshSessionManager, getMainWindow, isAgentSsh, getAgentWorkspace })
  registerWorkspaceHandlers({ database })
  registerConfigHandlers({ database })
  registerSystemHandlers({
    database, ptySessionManager, getMainWindow,
    getDiagnostics: () => diagnostics,
    setDiagnostics: (d) => { diagnostics = d },
    handleStatusChangeWithNotification,
    setMemoryMonitorTimer: (t) => { memoryMonitorTimer = t },
    setAgentTeamsTimer: (t) => { agentTeamsTimer = t }
  })
  // Initialize plugin system
  const pluginManager = new PluginManager()
  pluginManager.discover()
  registerPluginHandlers(pluginManager)
  for (const p of pluginManager.getPlugins()) {
    if (p.status === 'installed') pluginManager.start(p.id)
  }

  // Create window and tray
  mainWindow = createWindow(database)
  tray = createTray(database, getMainWindow)

  // Validate workspace paths on startup
  const workspaces = database.getWorkspaces()
  const invalidProjects: { workspaceId: string; projectPath: string }[] = []
  for (const ws of workspaces) {
    if (ws.connectionType !== 'local') continue
    for (const proj of ws.projects) {
      if (proj.path && !existsSync(proj.path)) {
        invalidProjects.push({ workspaceId: ws.id, projectPath: proj.path })
      }
    }
  }
  if (invalidProjects.length > 0) {
    setTimeout(() => mainWindow?.webContents.send('workspace:path-invalid', invalidProjects), 2000)
  }

  setupAppLifecycle({
    sessionManager, ptySessionManager, sshSessionManager, chainScheduler, database, pluginManager,
    getMemoryMonitorTimer: () => memoryMonitorTimer,
    getAgentTeamsTimer: () => agentTeamsTimer,
    createWindow: () => { mainWindow = createWindow(database) }
  })
})
