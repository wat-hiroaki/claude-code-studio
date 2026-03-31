export type AgentStatus =
  | 'creating'
  | 'active'
  | 'thinking'
  | 'tool_running'
  | 'awaiting'
  | 'error'
  | 'session_conflict'
  | 'idle'
  | 'archived'


export interface Agent {
  id: string
  name: string
  icon: string | null
  roleLabel: string | null
  workspaceId: string | null
  projectPath: string
  projectName: string
  sessionNumber: number
  status: AgentStatus
  currentTask: string | null
  systemPrompt: string | null
  claudeSessionId: string | null
  isPinned: boolean
  skills: string[]
  teamId: string | null
  reportTo: string | null
  parentAgentId: string | null
  isTemporary: boolean
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  name: string
  color: string
}

export interface AgentDefinition {
  id: string
  name: string
  icon: string | null
  roleLabel: string | null
  description: string
  defaultProjectPath: string | null
  systemPrompt: string | null
  skills: string[]
  createdAt: string
}

export type MessageRole = 'manager' | 'agent' | 'tool' | 'system'
export type ContentType = 'text' | 'code' | 'diff' | 'tool_exec' | 'error'

export interface Message {
  id: number
  agentId: string
  role: MessageRole
  contentType: ContentType
  content: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface TaskChain {
  id: string
  name: string
  triggerAgentId: string
  triggerCondition: {
    type: 'complete' | 'keyword' | 'no_error' | 'scheduled'
    keyword?: string
    cronExpression?: string
    intervalMinutes?: number
  }
  targetAgentId: string
  messageTemplate: string
  onError: 'stop' | 'skip' | 'notify_only'
  isActive: boolean
  createdAt: string
}

export type ChainExecutionStatus = 'running' | 'completed' | 'error'

export interface ChainExecutionLog {
  id: string
  chainId: string
  chainName: string
  triggerAgentId: string
  targetAgentId: string
  status: ChainExecutionStatus
  message: string
  errorMessage?: string
  startedAt: string
  completedAt?: string
  durationMs?: number
}

export interface PromptTemplate {
  id: string
  label: string
  value: string
  category: string
  isBuiltIn: boolean
  createdAt: string
}

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

export interface PermissionSettings {
  allowedTools: string[]
  deniedTools: string[]
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  agentId?: string | null
  createdAt: string
  updatedAt: string
}

export interface Broadcast {
  id: string
  messageTemplate: string
  targetAgentIds: string[]
  status: 'pending' | 'sent' | 'completed'
  responses: Record<string, string>
  createdAt: string
}

export interface WorkspaceProject {
  path: string
  name: string
  addedAt: string
}

export interface Workspace {
  id: string
  name: string
  path: string
  projects: WorkspaceProject[]
  color: string
  connectionType: 'local' | 'ssh'
  sshConfig?: {
    host: string
    port: number
    username: string
    privateKeyPath?: string
  }
  configStorageLocation: 'local' | 'remote'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceParams {
  name: string
  color?: string
  connectionType: 'local' | 'ssh'
  sshConfig?: Workspace['sshConfig']
  projects?: { path: string; name: string }[]
}

export interface CreateAgentParams {
  name: string
  projectPath: string
  projectName: string
  roleLabel?: string
  systemPrompt?: string
  skills?: string[]
  teamId?: string
  reportTo?: string
  workspaceId?: string
}

export interface TeamStats {
  total: number
  active: number
  thinking: number
  awaiting: number
  error: number
  completedToday: number
}

export interface ParsedOutputMessage {
  role: MessageRole
  contentType: ContentType
  content: string
  metadata?: Record<string, unknown>
}

export interface DiscoveredWorkspace {
  path: string
  name: string
  detectedFiles: {
    claudeMd: boolean
    claudeDir: boolean
    agentsMd: boolean
    packageJson: boolean
  }
  claudeMdPreview: string | null
  techStack: string[]
  lastModified: string
}

export interface ClaudeRuleFile {
  path: string
  name: string
  level: 'global' | 'project'
  lineCount: number
  sizeBytes: number
  preview: string
}

export interface ClaudeMemoryEntry {
  file: string
  lineCount: number
  lastModified: string
  preview: string
}

export interface ClaudeSkillEntry {
  name: string
  path: string
  type: 'skill' | 'command' | 'template'
}

export interface ClaudeMcpServer {
  name: string
  command: string
  args: string[]
  enabled: boolean
}

export interface ClaudeHook {
  event: string
  command: string
}

export interface HookExecutionLog {
  id: string
  event: string
  command: string
  agentId?: string
  projectPath?: string
  status: 'success' | 'blocked' | 'error'
  exitCode?: number
  output?: string
  executedAt: string
  durationMs?: number
}

export interface AgentProfileData {
  rules: ClaudeRuleFile[]
  memory: ClaudeMemoryEntry[]
  skills: ClaudeSkillEntry[]
  mcpServers: ClaudeMcpServer[]
  hooks: ClaudeHook[]
}

export type WorkspaceHealthStatus = 'healthy' | 'warning' | 'error'

export interface WorkspaceConfigData {
  mcpServers: ClaudeMcpServer[]
  skills: ClaudeSkillEntry[]
  commands: ClaudeSkillEntry[]
  templates: ClaudeSkillEntry[]
  healthStatus: WorkspaceHealthStatus
  healthIssues: string[]
}

export interface CliSessionInfo {
  sessionId: string
  projectPath: string
  model: string
  createdAt: string
  lastActiveAt: string
}

export interface AgentTemplate {
  name: string
  roleLabel: string | null
  systemPrompt: string | null
  skills: string[]
  exportedAt: string
  appVersion: string
}

export interface NotificationSettings {
  enabled: boolean
  taskComplete: boolean
  approvalRequired: boolean
  errors: boolean
}

export interface AppSettings {
  usePtyMode: boolean
  notifications: NotificationSettings
  composerHeight: number
}

export interface ElectronAPI {
  // Agent management
  createAgent: (params: CreateAgentParams) => Promise<Agent>
  getAgents: () => Promise<Agent[]>
  getAgent: (id: string) => Promise<Agent | null>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<Agent>
  archiveAgent: (id: string) => Promise<void>
  unarchiveAgent: (id: string) => Promise<void>
  deleteAgent: (id: string) => Promise<void>

  // Messaging
  sendMessage: (agentId: string, content: string) => Promise<void>
  getMessages: (agentId: string) => Promise<Message[]>

  // Agent control
  restartAgent: (id: string) => Promise<void>
  interruptAgent: (id: string) => Promise<void>

  // Broadcast
  broadcast: (agentIds: string[], message: string) => Promise<string>

  // Task chains
  createChain: (chain: Omit<TaskChain, 'id' | 'createdAt'>) => Promise<TaskChain>
  getChains: () => Promise<TaskChain[]>
  updateChain: (id: string, updates: Partial<TaskChain>) => Promise<TaskChain>
  deleteChain: (id: string) => Promise<void>

  // Teams
  createTeam: (name: string, color: string) => Promise<Team>
  getTeams: () => Promise<Team[]>
  updateTeam: (id: string, updates: Partial<Team>) => Promise<Team>
  deleteTeam: (id: string) => Promise<void>

  // Tasks
  createTask: (title: string, description?: string, status?: TaskStatus, agentId?: string) => Promise<Task>
  getTasks: () => Promise<Task[]>
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>
  deleteTask: (id: string) => Promise<void>

  // Prompt Templates
  createTemplate: (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'isBuiltIn'>) => Promise<PromptTemplate>
  getTemplates: () => Promise<PromptTemplate[]>
  updateTemplate: (id: string, updates: Partial<PromptTemplate>) => Promise<PromptTemplate>
  deleteTemplate: (id: string) => Promise<void>

  // Team stats
  getTeamStats: () => Promise<TeamStats>
  pollMemory: () => Promise<Array<{ agentId: string; memoryMB: number; pid: number }>>
  onMemoryUpdate: (callback: (data: Array<{ agentId: string; memoryMB: number; pid: number }>) => void) => () => void

  // Chain events
  onChainEvent: (callback: (event: { chainId: string; chainName: string; fromAgentId: string; toAgentId: string; status: string; message?: string; timestamp: string }) => void) => () => void

  // Dialog
  listDirs: (partial: string) => Promise<{ name: string; path: string }[]>
  confirm: (message: string, title?: string) => Promise<boolean>
  selectFolder: () => Promise<string | null>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>

  // Config files (B-1 to B-4)
  getMcpConfig: (scope: 'global' | 'project', projectPath?: string) => Promise<McpConfig>
  updateMcpConfig: (scope: 'global' | 'project', config: McpConfig, projectPath?: string) => Promise<void>
  getClaudeMd: (projectPath: string) => Promise<string>
  saveClaudeMd: (projectPath: string, content: string) => Promise<void>
  getPermissions: () => Promise<PermissionSettings>
  updatePermissions: (permissions: PermissionSettings) => Promise<void>

  // Events
  onAgentOutput: (callback: (agentId: string, message: ParsedOutputMessage) => void) => () => void
  onAgentDeleted: (callback: (agentId: string) => void) => () => void
  onAgentStatusChange: (callback: (agentId: string, status: AgentStatus) => void) => () => void
  onNotification: (callback: (title: string, body: string) => void) => () => void

  // Workspace scanner
  scanWorkspaces: (rootPath: string) => Promise<DiscoveredWorkspace[]>
  scanRemoteWorkspaces: (sshConfig: { host: string; port: number; username: string; privateKeyPath?: string }, rootPath: string) => Promise<DiscoveredWorkspace[]>

  // Workspaces
  createWorkspace: (params: CreateWorkspaceParams) => Promise<Workspace>
  getWorkspaces: () => Promise<Workspace[]>
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  setActiveWorkspace: (id: string | null) => Promise<void>
  addProjectToWorkspace: (workspaceId: string, project: { path: string; name: string }) => Promise<Workspace>
  removeProjectFromWorkspace: (workspaceId: string, projectPath: string) => Promise<Workspace>

  // PTY terminal
  ptyStart: (agentId: string) => Promise<void>
  ptyWrite: (agentId: string, data: string) => Promise<void>
  ptyResize: (agentId: string, cols: number, rows: number) => Promise<void>
  ptyInterrupt: (agentId: string) => Promise<void>
  ptyStop: (agentId: string) => Promise<void>
  ptyLastOutput: (agentId: string) => Promise<string>
  ptyGetScrollback: (agentId: string) => Promise<string>
  ptyResolveConflict: (agentId: string) => Promise<void>
  onPtyData: (callback: (agentId: string, data: string) => void) => () => void
  onPtyExit: (callback: (agentId: string, exitCode: number) => void) => () => void

  // Agent Profile
  getAgentProfile: (agentId: string) => Promise<AgentProfileData>
  readConfigFile: (filePath: string) => Promise<string>

  // SSH
  testSshConnection: (config: { host: string; port: number; username: string; privateKeyPath?: string }) => Promise<{ success: boolean; message: string }>

  // Sessions
  listCliSessions: () => Promise<CliSessionInfo[]>
  attachSession: (agentId: string, sessionId: string) => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>

  // Database
  exportDatabase: () => Promise<string | null>
  getDatabasePath: () => Promise<string>

  // Agent templates (export/import)
  exportAgentTemplate: (agentId: string) => Promise<string>
  importAgentTemplate: () => Promise<AgentTemplate | null>

  // Agent definitions (saved profiles)
  getAgentDefinitions: () => Promise<AgentDefinition[]>
  createAgentDefinition: (params: { name: string; icon?: string | null; roleLabel?: string | null; description: string; defaultProjectPath?: string | null; systemPrompt?: string | null; skills?: string[] }) => Promise<AgentDefinition>
  deleteAgentDefinition: (id: string) => Promise<void>

  // App
  getAppVersion: () => Promise<string>
  getPlatform: () => string
  setTitleBarTheme: (isDark: boolean) => Promise<void>

  // Update
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  // Workspace config (人材管理)
  getWorkspaceConfig: (workspacePath: string) => Promise<WorkspaceConfigData>
  getGlobalSkills: () => Promise<ClaudeSkillEntry[]>

  // Chain execution logs (勤怠管理)
  getChainExecutionLogs: (limit?: number) => Promise<ChainExecutionLog[]>
  getScheduledChains: () => Promise<TaskChain[]>

  // Diagnostics
  getDiagnosticLogs: (limit?: number, level?: string, category?: string) => Promise<DiagnosticLog[]>
  getDiagnosticStats: () => Promise<DiagnosticStats>
  exportDiagnostics: () => Promise<string | null>
  clearDiagnostics: () => Promise<void>
  setDiagnosticsEnabled: (enabled: boolean) => Promise<void>
  isDiagnosticsEnabled: () => Promise<boolean>

  // Workspace path events
  onWorkspacePathInvalid: (callback: (invalid: { workspaceId: string; projectPath: string }[]) => void) => () => void

  // Agent Teams (Claude Code CLI integration)
  getAgentTeamsData: () => Promise<AgentTeamsData>
  onAgentTeamsUpdate: (callback: (data: AgentTeamsData) => void) => () => void

  // Config Map
  getConfigMapData: (projectPath: string) => Promise<ConfigMapData>

  // Organization Overview
  getOrgOverview: (projectPaths: string[]) => Promise<WorkspaceConfigSummary[]>

  // Hook execution logs
  getHookExecutionLogs: (limit?: number, event?: string) => Promise<HookExecutionLog[]>

  // Window fullscreen
  toggleFullscreen: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>

  // Plugins
  pluginList: () => Promise<PluginInfo[]>
  pluginToolbarButtons: () => Promise<PluginToolbarButton[]>
  pluginContextTabs: () => Promise<PluginContextTab[]>
  pluginCall: (pluginId: string, tool: string, args: Record<string, unknown>) => Promise<unknown>
  pluginInstall: (pluginId: string) => Promise<void>
}

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal'
export type LogCategory = 'pty' | 'session' | 'ipc' | 'network' | 'ui' | 'system' | 'unknown'

export interface DiagnosticLog {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  details?: string
  agentId?: string
  sessionId?: string
  stack?: string
}

// Agent Teams (Claude Code CLI integration)
export interface ClaudeTaskSession {
  sessionId: string
  isLocked: boolean
  highwatermark: number
  lastModified: string
}

export interface ClaudeTeamConfig {
  teamName: string
  members: string[]
  metadata: Record<string, unknown>
}

export interface AgentTeamsData {
  taskSessions: ClaudeTaskSession[]
  teamConfigs: ClaudeTeamConfig[]
  lastScannedAt: string
}

export interface DiagnosticStats {
  totalLogs: number
  errorCount: number
  warnCount: number
  fatalCount: number
  oldestLog: string | null
  newestLog: string | null
  logSizeBytes: number
}

// Config Map types
export type ConfigNodeCategory = 'rules' | 'skills' | 'commands' | 'templates' | 'mcpServers' | 'hooks' | 'memory' | 'agents' | 'settings'
export type ConfigNodeLevel = 'global' | 'project' | 'agent'
export type ConfigEdgeRelationship = 'inherits' | 'overrides' | 'references' | 'configures'
export type ConfigConflictType = 'duplicate_mcp' | 'override_rule'

export interface ConfigNode {
  id: string
  label: string
  category: ConfigNodeCategory
  level: ConfigNodeLevel
  filePath: string
  lineCount: number
  sizeBytes: number
  preview: string
  metadata: Record<string, unknown>
}

export interface ConfigEdge {
  from: string
  to: string
  relationship: ConfigEdgeRelationship
}

export interface ConfigConflict {
  nodeIds: string[]
  type: ConfigConflictType
  description: string
}

export interface ConfigMapData {
  projectPath: string
  projectName: string
  nodes: ConfigNode[]
  edges: ConfigEdge[]
  conflicts: ConfigConflict[]
  scannedAt: string
}

// Plugin System
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  mcp: {
    command: string
    args: string[]
    bundled?: boolean
  }
  tools: { name: string; label: string; icon: string }[]
  ui: {
    toolbarButtons: { id: string; tool: string; icon: string; prompt: string }[]
    contextTab?: { id: string; label: string; icon: string; component: string }
  }
  permissions?: PluginPermissions
  install?: {
    check: string
    steps: string[]
  }
}

export interface PluginInfo {
  id: string
  manifest: PluginManifest
  status: 'installed' | 'not_installed' | 'running' | 'error'
}

export interface PluginToolbarButton {
  pluginId: string
  id: string
  tool: string
  icon: string
  prompt: string
}

export interface PluginContextTab {
  pluginId: string
  id: string
  label: string
  icon: string
  component: string
}

export interface PluginPermissions {
  allowedEnvVars: string[]
  fsPathPrefixes: string[]
  networkAccess: boolean
}

// Organization Overview: summary of each workspace's config
export interface WorkspaceConfigSummary {
  projectPath: string
  projectName: string
  nodeCounts: Record<ConfigNodeCategory, number>
  totalNodes: number
  totalEdges: number
  conflictCount: number
  agentNames: string[]
  mcpServerNames: string[]
  hasProjectClaude: boolean
  scannedAt: string
}
