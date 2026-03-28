import { app, ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Database } from '@main/database'
import type { PtySessionManager } from '@main/ptySessionManager'
import type { DiagnosticsEngine } from '@main/diagnostics'
import { readAgentTeamsData } from '@main/config'

interface SystemHandlerDeps {
  database: Database
  ptySessionManager: PtySessionManager
  getMainWindow: () => BrowserWindow | null
  getDiagnostics: () => DiagnosticsEngine | null
  setDiagnostics: (d: DiagnosticsEngine) => void
  handleStatusChangeWithNotification: (agentId: string, status: string) => void
  setMemoryMonitorTimer: (timer: ReturnType<typeof setInterval>) => void
  setAgentTeamsTimer: (timer: ReturnType<typeof setInterval>) => void
}

export function registerSystemHandlers(deps: SystemHandlerDeps): void {
  const {
    database, ptySessionManager,
    getMainWindow, getDiagnostics, setDiagnostics,
    handleStatusChangeWithNotification,
    setMemoryMonitorTimer, setAgentTeamsTimer
  } = deps

  // Dialog
  ipcMain.handle('dialog:confirm', async (_event, message: string, title?: string) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return false
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
      title: title || 'Confirm',
      message
    })
    return result.response === 1
  })

  // Path autocomplete
  ipcMain.handle('fs:listDirs', async (_event, partial: string) => {
    if (typeof partial !== 'string') return []
    const { readdirSync, statSync } = await import('fs')
    const { resolve, dirname, basename, sep } = await import('path')
    const { homedir } = await import('os')

    try {
      let expanded = partial.startsWith('~') ? partial.replace(/^~/, homedir()) : partial
      expanded = resolve(expanded)

      let dir: string
      let prefix: string
      try {
        const s = statSync(expanded)
        if (s.isDirectory()) {
          dir = expanded
          prefix = ''
        } else {
          dir = dirname(expanded)
          prefix = basename(expanded).toLowerCase()
        }
      } catch {
        dir = dirname(expanded)
        prefix = basename(expanded).toLowerCase()
      }

      const entries = readdirSync(dir, { withFileTypes: true })
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .filter((e) => !prefix || e.name.toLowerCase().startsWith(prefix))
        .slice(0, 15)
        .map((e) => ({
          name: e.name,
          path: dir + sep + e.name
        }))

      return dirs
    } catch {
      return []
    }
  })

  ipcMain.handle('dialog:selectFolder', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) throw new Error('No window available')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFile', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) throw new Error('No window available')
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // App version
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  // Titlebar theme
  ipcMain.handle('app:titlebar-theme', (_event, isDark: boolean) => {
    if (process.platform === 'linux') return // No titlebar overlay on Linux
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    mainWindow.setTitleBarOverlay({
      color: isDark ? '#09090b' : '#ffffff',
      symbolColor: isDark ? '#e0e0e0' : '#333333'
    })
  })

  // Window fullscreen
  ipcMain.handle('window:toggleFullscreen', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return false
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
    return mainWindow.isFullScreen()
  })

  ipcMain.handle('window:isFullscreen', () => {
    return getMainWindow()?.isFullScreen() ?? false
  })

  // Database backup/export
  ipcMain.handle('db:export', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
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

  // Diagnostics
  ipcMain.handle('diagnostics:getLogs', (_event, limit?: number, level?: string, category?: string) => {
    const diagnostics = getDiagnostics()
    if (!diagnostics) return []
    return diagnostics.getLogs(
      limit ?? 100,
      level as import('@main/diagnostics').LogLevel | undefined,
      category as import('@main/diagnostics').LogCategory | undefined
    )
  })

  ipcMain.handle('diagnostics:getStats', () => {
    const diagnostics = getDiagnostics()
    if (!diagnostics) return { totalLogs: 0, errorCount: 0, warnCount: 0, fatalCount: 0, oldestLog: null, newestLog: null, logSizeBytes: 0 }
    return diagnostics.getStats()
  })

  ipcMain.handle('diagnostics:export', async () => {
    const diagnostics = getDiagnostics()
    if (!diagnostics) return null
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `claude-code-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Diagnostic Logs', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, diagnostics.exportLogs(), 'utf-8')
    return filePath
  })

  ipcMain.handle('diagnostics:clear', () => {
    getDiagnostics()?.clearLogs()
  })

  ipcMain.handle('diagnostics:setEnabled', async (_event, enabled: boolean) => {
    const diagnostics = getDiagnostics()
    if (diagnostics) {
      diagnostics.setEnabled(enabled)
    } else {
      const { DiagnosticsEngine } = await import('@main/diagnostics')
      setDiagnostics(new DiagnosticsEngine(enabled))
    }
    database.updateSettings({ diagnosticsEnabled: enabled } as unknown as Partial<import('@shared/types').AppSettings>)
  })

  ipcMain.handle('diagnostics:isEnabled', () => {
    return getDiagnostics()?.isEnabled() ?? false
  })

  // Hook execution logs
  ipcMain.handle('hook:getLogs', (_event, limit?: number, event?: string) => {
    return database.getHookExecutionLogs(limit ?? 50, event)
  })

  // Agent Teams (Claude Code CLI integration)
  ipcMain.handle('agentTeams:get', () => {
    return readAgentTeamsData()
  })

  // Memory monitor timer (every 30s)
  const memTimer = setInterval(async () => {
    const mainWindow = getMainWindow()
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
            console.warn(`[MemoryMonitor] Agent ${agent.name} exceeded ${threshold}MB (${info.memoryMB}MB). Auto-restarting.`)
            ptySessionManager.stopSession(info.agentId)
            database.updateAgent(info.agentId, { status: 'idle' })
            handleStatusChangeWithNotification(info.agentId, 'idle')
            setTimeout(async () => {
              const freshAgent = database.getAgent(info.agentId)
              if (freshAgent) {
                await ptySessionManager.startSession(freshAgent)
                getMainWindow()?.webContents.send('notification', 'Memory Auto-Restart', `${agent.name}: restarted due to high memory (${info.memoryMB}MB)`)
              }
            }, 1000)
          } else {
            mainWindow.webContents.send('notification', 'Memory Warning', `${agent.name}: ${info.memoryMB}MB (threshold: ${threshold}MB)`)
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, 30000)
  setMemoryMonitorTimer(memTimer)

  // Agent Teams polling timer (every 15s)
  let prevAgentTeamsJson = ''
  const teamsTimer = setInterval(() => {
    const mainWindow = getMainWindow()
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
  setAgentTeamsTimer(teamsTimer)

  // Update install
  ipcMain.handle('update:install', async () => {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.quitAndInstall(false, true)
  })
}
