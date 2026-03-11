import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, ParsedOutputMessage } from '@shared/types'

const api: ElectronAPI = {
  // Agent management
  createAgent: (params) => ipcRenderer.invoke('agent:create', params),
  getAgents: () => ipcRenderer.invoke('agent:list'),
  getAgent: (id) => ipcRenderer.invoke('agent:get', id),
  updateAgent: (id, updates) => ipcRenderer.invoke('agent:update', id, updates),
  archiveAgent: (id) => ipcRenderer.invoke('agent:archive', id),

  // Messaging
  sendMessage: (agentId, content) => ipcRenderer.invoke('message:send', agentId, content),
  getMessages: (agentId) => ipcRenderer.invoke('message:list', agentId),

  // Agent control
  restartAgent: (id) => ipcRenderer.invoke('agent:restart', id),
  interruptAgent: (id) => ipcRenderer.invoke('agent:interrupt', id),

  // Broadcast
  broadcast: (agentIds, message) => ipcRenderer.invoke('broadcast:send', agentIds, message),

  // Task chains
  createChain: (chain) => ipcRenderer.invoke('chain:create', chain),
  getChains: () => ipcRenderer.invoke('chain:list'),
  updateChain: (id, updates) => ipcRenderer.invoke('chain:update', id, updates),
  deleteChain: (id) => ipcRenderer.invoke('chain:delete', id),

  // Teams
  createTeam: (name, color) => ipcRenderer.invoke('team:create', name, color),
  getTeams: () => ipcRenderer.invoke('team:list'),
  updateTeam: (id, updates) => ipcRenderer.invoke('team:update', id, updates),
  deleteTeam: (id) => ipcRenderer.invoke('team:delete', id),

  // Team stats
  getTeamStats: () => ipcRenderer.invoke('team:stats'),

  // Dialog
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Events
  onAgentOutput: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentId: string, message: ParsedOutputMessage): void => {
      callback(agentId, message)
    }
    ipcRenderer.on('agent:output', handler)
    return () => ipcRenderer.removeListener('agent:output', handler)
  },
  onAgentStatusChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentId: string, status: string): void => {
      callback(agentId, status as import('@shared/types').AgentStatus)
    }
    ipcRenderer.on('agent:status-change', handler)
    return () => ipcRenderer.removeListener('agent:status-change', handler)
  },
  onNotification: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, title: string, body: string): void => {
      callback(title, body)
    }
    ipcRenderer.on('notification', handler)
    return () => ipcRenderer.removeListener('notification', handler)
  },

  // Workspace scanner
  scanWorkspaces: (rootPath) => ipcRenderer.invoke('workspace:scan', rootPath),

  // App
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => process.platform,
  setTitleBarTheme: (isDark: boolean) => ipcRenderer.invoke('app:titlebar-theme', isDark)
}

contextBridge.exposeInMainWorld('api', api)
