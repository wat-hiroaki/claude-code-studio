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

  // PTY terminal
  ptyStart: (agentId: string) => Promise<void>
  ptyWrite: (agentId: string, data: string) => Promise<void>
  ptyResize: (agentId: string, cols: number, rows: number) => Promise<void>
  ptyInterrupt: (agentId: string) => Promise<void>
  ptyStop: (agentId: string) => Promise<void>
  onPtyData: (callback: (agentId: string, data: string) => void) => () => void
  onPtyExit: (callback: (agentId: string, exitCode: number) => void) => () => void

  // App
  getAppVersion: () => Promise<string>
  getPlatform: () => string
  setTitleBarTheme: (isDark: boolean) => Promise<void>
}
