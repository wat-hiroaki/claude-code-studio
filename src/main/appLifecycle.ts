import { app, BrowserWindow } from 'electron'
import type { SessionManager } from '@main/sessionManager'
import type { PtySessionManager } from '@main/ptySessionManager'
import type { SshSessionManager } from '@main/sshSessionManager'
import type { ChainScheduler } from '@main/scheduler'
import type { Database } from '@main/database'
import type { PluginManager } from '@main/plugins/pluginManager'
import { setAppQuitting } from '@main/appState'

let _isQuitting = false

export function isAppQuitting(): boolean {
  return _isQuitting
}

export function setAppQuitting(value: boolean): void {
  _isQuitting = value
}

interface LifecycleDeps {
  sessionManager: SessionManager
  ptySessionManager: PtySessionManager
  sshSessionManager: SshSessionManager
  chainScheduler: ChainScheduler
  database: Database
  pluginManager: PluginManager
  getMemoryMonitorTimer: () => ReturnType<typeof setInterval> | null
  getAgentTeamsTimer: () => ReturnType<typeof setInterval> | null
  createWindow: () => void
}

export function setupAppLifecycle(deps: LifecycleDeps): void {
  app.on('window-all-closed', () => {
    // Keep running in tray on Windows
    if (process.platform !== 'win32') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    setAppQuitting(true)
    const memTimer = deps.getMemoryMonitorTimer()
    if (memTimer) clearInterval(memTimer)
    const teamsTimer = deps.getAgentTeamsTimer()
    if (teamsTimer) clearInterval(teamsTimer)
    deps.chainScheduler?.stop()
    deps.sessionManager.stopAll()
    deps.ptySessionManager.stopAll()
    deps.sshSessionManager.stopAll()
    deps.pluginManager.stopAll()
    deps.database.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) deps.createWindow()
  })
}
