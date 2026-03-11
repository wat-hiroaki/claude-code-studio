export type AgentStatus =
  | 'creating'
  | 'active'
  | 'thinking'
  | 'tool_running'
  | 'awaiting'
  | 'error'
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
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  name: string
  color: string
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
    type: 'complete' | 'keyword' | 'no_error'
    keyword?: string
  }
  targetAgentId: string
  messageTemplate: string
  onError: 'stop' | 'skip' | 'notify_only'
  isActive: boolean
  createdAt: string
}

export interface Broadcast {
  id: string
  messageTemplate: string
  targetAgentIds: string[]
  status: 'pending' | 'sent' | 'completed'
  responses: Record<string, string>
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
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
}

export interface TeamStats {
  active: number
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

export interface AgentProfileData {
  rules: ClaudeRuleFile[]
  memory: ClaudeMemoryEntry[]
  skills: ClaudeSkillEntry[]
  mcpServers: ClaudeMcpServer[]
  hooks: ClaudeHook[]
}

export interface AgentTemplate {
  name: string
  roleLabel: string | null
  systemPrompt: string | null
  skills: string[]
  exportedAt: string
  appVersion: string
}

export interface AppSettings {
  usePtyMode: boolean
}

export interface ElectronAPI {
  // Agent management
  createAgent: (params: CreateAgentParams) => Promise<Agent>
  getAgents: () => Promise<Agent[]>
  getAgent: (id: string) => Promise<Agent | null>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<Agent>
  archiveAgent: (id: string) => Promise<void>

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

  // Team stats
  getTeamStats: () => Promise<TeamStats>

  // Dialog
  selectFolder: () => Promise<string | null>

  // Events
  onAgentOutput: (callback: (agentId: string, message: ParsedOutputMessage) => void) => () => void
  onAgentStatusChange: (callback: (agentId: string, status: AgentStatus) => void) => () => void
  onNotification: (callback: (title: string, body: string) => void) => () => void

  // Workspace scanner
  scanWorkspaces: (rootPath: string) => Promise<DiscoveredWorkspace[]>

  // Workspaces
  createWorkspace: (params: CreateWorkspaceParams) => Promise<Workspace>
  getWorkspaces: () => Promise<Workspace[]>
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  setActiveWorkspace: (id: string | null) => Promise<void>

  // PTY terminal
  ptyStart: (agentId: string) => Promise<void>
  ptyWrite: (agentId: string, data: string) => Promise<void>
  ptyResize: (agentId: string, cols: number, rows: number) => Promise<void>
  ptyInterrupt: (agentId: string) => Promise<void>
  ptyStop: (agentId: string) => Promise<void>
  ptyLastOutput: (agentId: string) => Promise<string>
  onPtyData: (callback: (agentId: string, data: string) => void) => () => void
  onPtyExit: (callback: (agentId: string, exitCode: number) => void) => () => void

  // Agent Profile
  getAgentProfile: (agentId: string) => Promise<AgentProfileData>
  readConfigFile: (filePath: string) => Promise<string>

  // SSH
  testSshConnection: (config: { host: string; port: number; username: string; privateKeyPath?: string }) => Promise<{ success: boolean; message: string }>

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>

  // Database
  exportDatabase: () => Promise<string | null>
  getDatabasePath: () => Promise<string>

  // Agent templates
  exportAgentTemplate: (agentId: string) => Promise<string>
  importAgentTemplate: () => Promise<AgentTemplate | null>

  // App
  getAppVersion: () => Promise<string>
  getPlatform: () => string
  setTitleBarTheme: (isDark: boolean) => Promise<void>
}
