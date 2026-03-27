import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Database } from '@main/database'

const notificationTimers = new Map<string, ReturnType<typeof setTimeout>>()
const NOTIFICATION_DEBOUNCE_MS = 30000

function sendNotification(
  database: Database,
  getMainWindow: () => BrowserWindow | null,
  agentId: string,
  type: 'awaiting' | 'error' | 'taskComplete'
): void {
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
  getMainWindow()?.webContents.send('notification', title, body)
}

export function debouncedNotification(
  database: Database,
  getMainWindow: () => BrowserWindow | null,
  agentId: string,
  type: 'awaiting' | 'error' | 'taskComplete'
): void {
  const key = `${agentId}:${type}`
  if (notificationTimers.has(key)) return

  const mainWindow = getMainWindow()
  if (mainWindow?.isFocused()) {
    mainWindow.webContents.send('notification',
      type === 'awaiting' ? 'Approval Required' : type === 'error' ? 'Error Occurred' : 'Task Complete',
      `${database.getAgent(agentId)?.name || 'Agent'}: Check agent for details`
    )
  } else {
    sendNotification(database, getMainWindow, agentId, type)
  }
  notificationTimers.set(key, setTimeout(() => notificationTimers.delete(key), NOTIFICATION_DEBOUNCE_MS))
}
