import type {
  Agent,
  Team,
  Message,
  TaskChain,
  Broadcast,
  Workspace,
  WorkspaceProject,
  Task,
  PromptTemplate,
  AgentDefinition,
  ChainExecutionLog,
  HookExecutionLog
} from '@shared/types'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

export interface NotificationSettings {
  enabled: boolean
  taskComplete: boolean
  approvalRequired: boolean
  errors: boolean
}

export interface AppSettings {
  usePtyMode: boolean
  windowBounds?: WindowBounds
  notifications: NotificationSettings
  composerHeight: number
  memoryThresholdMB: number
  autoRestartOnMemoryExceeded: boolean
}

export interface DBData {
  agents: Agent[]
  teams: Team[]
  messages: Message[]
  taskChains: TaskChain[]
  broadcasts: Broadcast[]
  workspaces: Workspace[]
  tasks: Task[]
  promptTemplates: PromptTemplate[]
  agentTemplates: AgentDefinition[]
  chainExecutionLogs: ChainExecutionLog[]
  hookExecutionLogs: HookExecutionLog[]
  activeWorkspaceId: string | null
  settings: AppSettings
  nextMessageId: number
  sessionScrollbacks: Record<string, string>
}

/** Internal interface for query modules to access Database internals */
export interface DatabaseInternals {
  readonly _data: DBData
  _scheduleSave(): void
}
