import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, ParsedOutputMessage } from '@shared/types'

const api: ElectronAPI = {
  // Agent management
  createAgent: (params) => ipcRenderer.invoke('agent:create', params),
  getAgents: () => ipcRenderer.invoke('agent:list'),
  getAgent: (id) => ipcRenderer.invoke('agent:get', id),
  updateAgent: (id, updates) => ipcRenderer.invoke('agent:update', id, updates),
  archiveAgent: (id) => ipcRenderer.invoke('agent:archive', id),
  unarchiveAgent: (id) => ipcRenderer.invoke('agent:unarchive', id),

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

  // Tasks
  createTask: (title, description, status, agentId) => ipcRenderer.invoke('task:create', title, description, status, agentId),
  getTasks: () => ipcRenderer.invoke('task:list'),
  updateTask: (id, updates) => ipcRenderer.invoke('task:update', id, updates),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),

  // Prompt Templates
  createTemplate: (template) => ipcRenderer.invoke('template:create', template),
  getTemplates: () => ipcRenderer.invoke('template:list'),
  updateTemplate: (id, updates) => ipcRenderer.invoke('template:update', id, updates),
  deleteTemplate: (id) => ipcRenderer.invoke('template:delete', id),

  // Team stats
  getTeamStats: () => ipcRenderer.invoke('team:stats'),
  pollMemory: () => ipcRenderer.invoke('memory:poll'),
  onMemoryUpdate: (callback: (data: Array<{ agentId: string; memoryMB: number; pid: number }>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Array<{ agentId: string; memoryMB: number; pid: number }>) => callback(data)
    ipcRenderer.on('memory:update', handler)
    return () => ipcRenderer.removeListener('memory:update', handler)
  },

  // Chain events
  onChainEvent: (callback: (event: { chainId: string; chainName: string; fromAgentId: string; toAgentId: string; status: string; message?: string; timestamp: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data)
    ipcRenderer.on('chain:event', handler)
    return () => ipcRenderer.removeListener('chain:event', handler)
  },

  // Dialog
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Config files (B-1 to B-4)
  getMcpConfig: (scope, projectPath) => ipcRenderer.invoke('config:getMcp', scope, projectPath),
  updateMcpConfig: (scope, config, projectPath) => ipcRenderer.invoke('config:updateMcp', scope, config, projectPath),
  getClaudeMd: (projectPath) => ipcRenderer.invoke('config:getClaudeMd', projectPath),
  saveClaudeMd: (projectPath, content) => ipcRenderer.invoke('config:saveClaudeMd', projectPath, content),
  getPermissions: () => ipcRenderer.invoke('config:getPermissions'),
  updatePermissions: (permissions) => ipcRenderer.invoke('config:updatePermissions', permissions),

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

  // Workspaces
  createWorkspace: (params) => ipcRenderer.invoke('workspace:create', params),
  getWorkspaces: () => ipcRenderer.invoke('workspace:list'),
  updateWorkspace: (id, updates) => ipcRenderer.invoke('workspace:update', id, updates),
  deleteWorkspace: (id) => ipcRenderer.invoke('workspace:delete', id),
  setActiveWorkspace: (id) => ipcRenderer.invoke('workspace:setActive', id),

  // Workspace scanner
  scanWorkspaces: (rootPath) => ipcRenderer.invoke('workspace:scan', rootPath),
  scanRemoteWorkspaces: (sshConfig, rootPath) => ipcRenderer.invoke('workspace:scan-remote', sshConfig, rootPath),

  // PTY terminal
  ptyStart: (agentId) => ipcRenderer.invoke('pty:start', agentId),
  ptyWrite: (agentId, data) => ipcRenderer.invoke('pty:write', agentId, data),
  ptyResize: (agentId, cols, rows) => ipcRenderer.invoke('pty:resize', agentId, cols, rows),
  ptyInterrupt: (agentId) => ipcRenderer.invoke('pty:interrupt', agentId),
  ptyStop: (agentId) => ipcRenderer.invoke('pty:stop', agentId),
  ptyLastOutput: (agentId) => ipcRenderer.invoke('pty:lastOutput', agentId),
  ptyGetScrollback: (agentId) => ipcRenderer.invoke('pty:scrollback', agentId),
  ptyResolveConflict: (agentId) => ipcRenderer.invoke('pty:resolveConflict', agentId),
  onPtyData: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentId: string, data: string): void => {
      callback(agentId, data)
    }
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onPtyExit: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, agentId: string, exitCode: number): void => {
      callback(agentId, exitCode)
    }
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },

  // Agent Profile
  getAgentProfile: (agentId) => ipcRenderer.invoke('agent:profile', agentId),
  readConfigFile: (filePath) => ipcRenderer.invoke('agent:readFile', filePath),

  // Workspace config (人材管理)
  getWorkspaceConfig: (workspacePath) => ipcRenderer.invoke('workspace:config', workspacePath),
  getGlobalSkills: () => ipcRenderer.invoke('workspace:globalSkills'),

  // Chain execution logs (勤怠管理)
  getChainExecutionLogs: (limit) => ipcRenderer.invoke('chain:executionLogs', limit),
  getScheduledChains: () => ipcRenderer.invoke('chain:scheduled'),

  // SSH
  testSshConnection: (config) => ipcRenderer.invoke('ssh:test', config),

  // Database
  exportDatabase: () => ipcRenderer.invoke('db:export'),
  getDatabasePath: () => ipcRenderer.invoke('db:path'),

  // Agent templates
  exportAgentTemplate: (agentId) => ipcRenderer.invoke('agent:exportTemplate', agentId),
  importAgentTemplate: () => ipcRenderer.invoke('agent:importTemplate'),

  // Agent definitions (saved profiles)
  getAgentDefinitions: () => ipcRenderer.invoke('agentDef:list'),
  createAgentDefinition: (params) => ipcRenderer.invoke('agentDef:create', params),
  deleteAgentDefinition: (id) => ipcRenderer.invoke('agentDef:delete', id),

  // Sessions
  listCliSessions: () => ipcRenderer.invoke('session:list'),
  attachSession: (agentId, sessionId) => ipcRenderer.invoke('session:attach', agentId, sessionId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (updates) => ipcRenderer.invoke('settings:update', updates),

  // App
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => process.platform,
  setTitleBarTheme: (isDark: boolean) => ipcRenderer.invoke('app:titlebar-theme', isDark),

  // Update
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string): void => { callback(version) }
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.removeListener('update:available', handler)
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number): void => { callback(percent) }
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.removeListener('update:progress', handler)
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string): void => { callback(version) }
    ipcRenderer.on('update:downloaded', handler)
    return () => ipcRenderer.removeListener('update:downloaded', handler)
  },
  // Diagnostics
  getDiagnosticLogs: (limit?: number, level?: string, category?: string) => ipcRenderer.invoke('diagnostics:getLogs', limit, level, category),
  getDiagnosticStats: () => ipcRenderer.invoke('diagnostics:getStats'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  clearDiagnostics: () => ipcRenderer.invoke('diagnostics:clear'),
  setDiagnosticsEnabled: (enabled: boolean) => ipcRenderer.invoke('diagnostics:setEnabled', enabled),
  isDiagnosticsEnabled: () => ipcRenderer.invoke('diagnostics:isEnabled'),

  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Config Map
  getConfigMapData: (projectPath: string) => ipcRenderer.invoke('config:getConfigMap', projectPath),

  // Hook execution logs
  getHookExecutionLogs: (limit?: number, event?: string) => ipcRenderer.invoke('hook:getLogs', limit, event),

  // Agent Teams (Claude Code CLI integration)
  getAgentTeamsData: () => ipcRenderer.invoke('agentTeams:get'),
  onAgentTeamsUpdate: (callback: (data: import('@shared/types').AgentTeamsData) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: import('@shared/types').AgentTeamsData): void => {
      callback(data)
    }
    ipcRenderer.on('agentTeams:update', handler)
    return () => ipcRenderer.removeListener('agentTeams:update', handler)
  },

  // Workspace path events
  onWorkspacePathInvalid: (callback: (workspaceIds: string[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspaceIds: string[]): void => {
      callback(workspaceIds)
    }
    ipcRenderer.on('workspace:path-invalid', handler)
    return () => ipcRenderer.removeListener('workspace:path-invalid', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
