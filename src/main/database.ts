import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, Team, Message, TaskChain, Broadcast, CreateAgentParams, TeamStats, Workspace, CreateWorkspaceParams, Task, TaskStatus, PromptTemplate, AgentDefinition, ChainExecutionLog, HookExecutionLog } from '@shared/types'

interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

interface NotificationSettings {
  enabled: boolean
  taskComplete: boolean
  approvalRequired: boolean
  errors: boolean
}

interface AppSettings {
  usePtyMode: boolean
  windowBounds?: WindowBounds
  notifications: NotificationSettings
  composerHeight: number
  memoryThresholdMB: number
  autoRestartOnMemoryExceeded: boolean
}

interface DBData {
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

export class Database {
  private data: DBData
  private dbPath: string
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.dbPath = join(userDataPath, 'database.json')
    this.data = this.load()
  }

  private load(): DBData {
    if (existsSync(this.dbPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.dbPath, 'utf-8'))
        return this.migrate(raw)
      } catch {
        // Corrupted file, start fresh
      }
    }
    return {
      agents: [],
      teams: [],
      messages: [],
      taskChains: [],
      broadcasts: [],
      workspaces: [],
      tasks: [],
      promptTemplates: [],
      agentTemplates: [],
      chainExecutionLogs: [],
      hookExecutionLogs: [],
      activeWorkspaceId: null,
      settings: {
        usePtyMode: true,
        notifications: { enabled: true, taskComplete: true, approvalRequired: true, errors: true },
        composerHeight: 0,
        memoryThresholdMB: 2048,
        autoRestartOnMemoryExceeded: false
      },
      nextMessageId: 1,
      sessionScrollbacks: {}
    }
  }

  /** Backfill missing fields from older database formats */
  private migrate(raw: Record<string, unknown>): DBData {
    // Ensure all top-level arrays/fields exist
    if (!Array.isArray(raw.workspaces)) raw.workspaces = []
    if (raw.activeWorkspaceId === undefined) raw.activeWorkspaceId = null
    if (!Array.isArray(raw.agents)) raw.agents = []
    if (!Array.isArray(raw.teams)) raw.teams = []
    if (!Array.isArray(raw.messages)) raw.messages = []
    if (!Array.isArray(raw.taskChains)) raw.taskChains = []
    if (!Array.isArray(raw.broadcasts)) raw.broadcasts = []
    if (!Array.isArray(raw.tasks)) raw.tasks = []
    if (!Array.isArray(raw.promptTemplates)) raw.promptTemplates = []
    if (typeof raw.nextMessageId !== 'number') raw.nextMessageId = 1
    if (!raw.settings || typeof raw.settings !== 'object') {
      raw.settings = { usePtyMode: true, notifications: { enabled: true, taskComplete: true, approvalRequired: true, errors: true }, composerHeight: 0 }
    }
    const settings = raw.settings as Record<string, unknown>
    if (!settings.notifications) {
      settings.notifications = { enabled: true, taskComplete: true, approvalRequired: true, errors: true }
    }
    if (typeof settings.composerHeight !== 'number') {
      settings.composerHeight = 0
    }
    if (typeof settings.memoryThresholdMB !== 'number') {
      settings.memoryThresholdMB = 2048
    }
    if (typeof settings.autoRestartOnMemoryExceeded !== 'boolean') {
      settings.autoRestartOnMemoryExceeded = false
    }

    // Backfill message metadata
    if (Array.isArray(raw.messages)) {
      for (const msg of raw.messages as Record<string, unknown>[]) {
        if (msg.metadata === undefined) msg.metadata = null
      }
    }

    // Backfill agent-level fields added after initial release
    for (const agent of raw.agents as Record<string, unknown>[]) {
      if (agent.workspaceId === undefined) agent.workspaceId = null
      if (agent.parentAgentId === undefined) agent.parentAgentId = null
      if (agent.isTemporary === undefined) agent.isTemporary = false
    }

    // Backfill agentTemplates
    if (!Array.isArray(raw.agentTemplates)) raw.agentTemplates = []

    // Backfill sessionScrollbacks
    if (!raw.sessionScrollbacks || typeof raw.sessionScrollbacks !== 'object') {
      raw.sessionScrollbacks = {}
    }

    // Backfill chainExecutionLogs
    if (!Array.isArray(raw.chainExecutionLogs)) raw.chainExecutionLogs = []
    // Backfill hookExecutionLogs
    if (!Array.isArray(raw.hookExecutionLogs)) raw.hookExecutionLogs = []

    // Backfill workspace path from agent projectPaths
    for (const ws of raw.workspaces as Record<string, unknown>[]) {
      if (!ws.path) {
        const agents = (raw.agents as Record<string, unknown>[]).filter(
          (a) => a.workspaceId === ws.id
        )
        const pathCounts = new Map<string, number>()
        for (const a of agents) {
          const p = String(a.projectPath || '')
          if (p) pathCounts.set(p, (pathCounts.get(p) || 0) + 1)
        }
        const sorted = [...pathCounts.entries()].sort((a, b) => b[1] - a[1])
        ws.path = sorted[0]?.[0] ?? ''
      }
    }

    return raw as unknown as DBData
  }

  private save(): void {
    // Atomic write: write to temp file then rename
    const tmpPath = this.dbPath + '.tmp'
    const data = JSON.stringify(this.data, null, 2)
    writeFileSync(tmpPath, data, 'utf-8')
    try {
      renameSync(tmpPath, this.dbPath)
    } catch {
      // Retry once after brief delay (Windows file lock)
      try {
        renameSync(tmpPath, this.dbPath)
      } catch {
        // Last resort: direct write
        writeFileSync(this.dbPath, data, 'utf-8')
      }
    }
  }

  private scheduleSave(): void {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.dirty) {
        this.dirty = false
        this.save()
      }
    }, 500)
  }

  exportData(): string {
    return JSON.stringify(this.data, null, 2)
  }

  // Scrollback buffer management (max 50KB per agent)
  saveScrollback(agentId: string, buffer: string): void {
    this.data.sessionScrollbacks[agentId] = buffer.slice(-50000)
    this.scheduleSave()
  }

  getScrollback(agentId: string): string {
    return this.data.sessionScrollbacks[agentId] ?? ''
  }

  saveAllScrollbacks(scrollbacks: Record<string, string>): void {
    for (const [id, buf] of Object.entries(scrollbacks)) {
      this.data.sessionScrollbacks[id] = buf.slice(-50000)
    }
    this.scheduleSave()
  }

  getDbPath(): string {
    return this.dbPath
  }

  // Agents
  createAgent(params: CreateAgentParams): Agent {
    const id = uuidv4()
    const sessionNumber = this.getNextSessionNumber(params.projectPath)
    const now = new Date().toISOString()

    const agent: Agent = {
      id,
      name: params.name,
      icon: null,
      roleLabel: params.roleLabel ?? null,
      workspaceId: params.workspaceId ?? this.data.activeWorkspaceId,
      projectPath: params.projectPath,
      projectName: params.projectName,
      sessionNumber,
      status: 'creating',
      currentTask: null,
      systemPrompt: params.systemPrompt ?? null,
      claudeSessionId: null,
      isPinned: false,
      skills: params.skills ?? [],
      teamId: params.teamId ?? null,
      reportTo: params.reportTo ?? null,
      parentAgentId: null,
      isTemporary: false,
      createdAt: now,
      updatedAt: now
    }

    this.data.agents.push(agent)
    this.scheduleSave()
    return agent
  }

  private getNextSessionNumber(projectPath: string): number {
    const existing = this.data.agents.filter((a) => a.projectPath === projectPath)
    return existing.length > 0 ? Math.max(...existing.map((a) => a.sessionNumber)) + 1 : 1
  }

  getAgent(id: string): Agent | null {
    return this.data.agents.find((a) => a.id === id) ?? null
  }

  getAgents(workspaceId?: string | null): Agent[] {
    return this.data.agents
      .filter((a) => a.status !== 'archived')
      .filter((a) => workspaceId === undefined || a.workspaceId === workspaceId)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
  }

  updateAgent(id: string, updates: Record<string, unknown>): Agent {
    const agent = this.data.agents.find((a) => a.id === id)
    if (!agent) throw new Error(`Agent ${id} not found`)

    const allowedFields = ['name', 'icon', 'roleLabel', 'status', 'currentTask', 'systemPrompt', 'claudeSessionId', 'isPinned', 'skills', 'teamId', 'reportTo']
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        ;(agent as unknown as Record<string, unknown>)[key] = value
      }
    }
    agent.updatedAt = new Date().toISOString()
    this.scheduleSave()
    return agent
  }

  // Messages (capped at 200 per agent to prevent unbounded memory growth)
  private static readonly MAX_MESSAGES_PER_AGENT = 200

  addMessage(agentId: string, role: string, contentType: string, content: string, metadata?: Record<string, unknown>): Message {
    const msg: Message = {
      id: this.data.nextMessageId++,
      agentId,
      role: role as Message['role'],
      contentType: contentType as Message['contentType'],
      content,
      metadata: metadata ?? null,
      createdAt: new Date().toISOString()
    }
    this.data.messages.push(msg)

    // Prune oldest messages for this agent if over limit
    const agentMsgs = this.data.messages.filter(m => m.agentId === agentId)
    if (agentMsgs.length > Database.MAX_MESSAGES_PER_AGENT) {
      const toRemove = agentMsgs.length - Database.MAX_MESSAGES_PER_AGENT
      const idsToRemove = new Set(
        agentMsgs
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, toRemove)
          .map(m => m.id)
      )
      this.data.messages = this.data.messages.filter(m => !idsToRemove.has(m.id))
    }

    this.scheduleSave()
    return msg
  }

  getMessages(agentId: string): Message[] {
    return this.data.messages
      .filter((m) => m.agentId === agentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  // Task Chains
  createChain(chain: Omit<TaskChain, 'id' | 'createdAt'>): TaskChain {
    const tc: TaskChain = {
      ...chain,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    }
    this.data.taskChains.push(tc)
    this.scheduleSave()
    return tc
  }

  getChains(): TaskChain[] {
    return this.data.taskChains
  }

  updateChain(id: string, updates: Partial<TaskChain>): TaskChain {
    const chain = this.data.taskChains.find((c) => c.id === id)
    if (!chain) throw new Error(`Chain ${id} not found`)
    Object.assign(chain, updates)
    this.scheduleSave()
    return chain
  }

  deleteChain(id: string): void {
    this.data.taskChains = this.data.taskChains.filter((c) => c.id !== id)
    this.scheduleSave()
  }

  // Broadcasts
  createBroadcast(message: string, agentIds: string[]): string {
    const b: Broadcast = {
      id: uuidv4(),
      messageTemplate: message,
      targetAgentIds: agentIds,
      status: 'pending',
      responses: {},
      createdAt: new Date().toISOString()
    }
    this.data.broadcasts.push(b)
    this.scheduleSave()
    return b.id
  }

  updateBroadcast(id: string, updates: Partial<Broadcast>): void {
    const b = this.data.broadcasts.find((br) => br.id === id)
    if (b) {
      Object.assign(b, updates)
      this.scheduleSave()
    }
  }

  // Teams
  createTeam(name: string, color: string): Team {
    const team: Team = { id: uuidv4(), name, color }
    this.data.teams.push(team)
    this.scheduleSave()
    return team
  }

  getTeams(): Team[] {
    return this.data.teams
  }

  updateTeam(id: string, updates: Partial<Team>): Team {
    const team = this.data.teams.find((t) => t.id === id)
    if (!team) throw new Error(`Team ${id} not found`)
    if (updates.name !== undefined) team.name = updates.name
    if (updates.color !== undefined) team.color = updates.color
    this.scheduleSave()
    return team
  }

  deleteTeam(id: string): void {
    this.data.teams = this.data.teams.filter((t) => t.id !== id)
    // Unassign agents from deleted team
    for (const agent of this.data.agents) {
      if (agent.teamId === id) agent.teamId = null
    }
    this.scheduleSave()
  }

  // Tasks
  createTask(title: string, description?: string, status: TaskStatus = 'todo', agentId?: string): Task {
    const task: Task = {
      id: uuidv4(),
      title,
      description,
      status,
      agentId: agentId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.data.tasks.push(task)
    this.scheduleSave()
    return task
  }

  getTasks(): Task[] {
    return this.data.tasks || []
  }

  updateTask(id: string, updates: Partial<Task>): Task {
    const task = this.data.tasks.find(t => t.id === id)
    if (!task) throw new Error(`Task ${id} not found`)
    
    if (updates.title !== undefined) task.title = updates.title
    if (updates.description !== undefined) task.description = updates.description
    if (updates.status !== undefined) task.status = updates.status
    if (updates.agentId !== undefined) task.agentId = updates.agentId
    task.updatedAt = new Date().toISOString()
    
    this.scheduleSave()
    return task
  }

  deleteTask(id: string): void {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id)
    this.scheduleSave()
  }

  // Team Stats
  getTeamStats(): TeamStats {
    const agents = this.getAgents()
    const today = new Date().toISOString().slice(0, 10)
    const completedToday = agents.filter(
      (a) => a.status === 'idle' && a.updatedAt.startsWith(today)
    ).length
    return {
      total: agents.length,
      active: agents.filter((a) => ['active', 'thinking', 'tool_running'].includes(a.status)).length,
      thinking: agents.filter((a) => a.status === 'thinking' || a.status === 'tool_running').length,
      awaiting: agents.filter((a) => a.status === 'awaiting').length,
      error: agents.filter((a) => a.status === 'error').length,
      completedToday
    }
  }

  // Workspaces
  createWorkspace(params: CreateWorkspaceParams): Workspace {
    const now = new Date().toISOString()
    const workspace: Workspace = {
      id: uuidv4(),
      name: params.name,
      path: params.path ?? '',
      color: params.color ?? '#748ffc',
      connectionType: params.connectionType,
      sshConfig: params.sshConfig,
      configStorageLocation: 'local',
      isActive: false,
      createdAt: now,
      updatedAt: now
    }
    this.data.workspaces.push(workspace)
    this.scheduleSave()
    return workspace
  }

  getWorkspaces(): Workspace[] {
    return this.data.workspaces
  }

  updateWorkspace(id: string, updates: Partial<Workspace>): Workspace {
    const ws = this.data.workspaces.find((w) => w.id === id)
    if (!ws) throw new Error(`Workspace ${id} not found`)

    // Detect path change and cascade to agents
    if (updates.path && updates.path !== ws.path && ws.path) {
      const oldPath = ws.path
      const newPath = updates.path
      for (const agent of this.data.agents) {
        if (agent.workspaceId === id && agent.projectPath.startsWith(oldPath)) {
          agent.projectPath = agent.projectPath.replace(oldPath, newPath)
          agent.updatedAt = new Date().toISOString()
        }
      }
    }

    const allowedFields = ['name', 'path', 'color', 'connectionType', 'sshConfig', 'configStorageLocation', 'isActive']
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        ;(ws as unknown as Record<string, unknown>)[key] = value
      }
    }
    ws.updatedAt = new Date().toISOString()
    this.scheduleSave()
    return ws
  }

  deleteWorkspace(id: string): void {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    if (this.data.activeWorkspaceId === id) {
      this.data.activeWorkspaceId = null
    }
    this.scheduleSave()
  }

  setActiveWorkspace(id: string | null): void {
    if (id && !this.data.workspaces.find((w) => w.id === id)) {
      throw new Error(`Workspace ${id} not found`)
    }
    this.data.activeWorkspaceId = id
    this.scheduleSave()
  }

  getActiveWorkspaceId(): string | null {
    return this.data.activeWorkspaceId
  }

  // Settings
  getSettings(): AppSettings {
    return this.data.settings ?? { usePtyMode: true }
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.getSettings(), ...updates }
    this.scheduleSave()
    return this.data.settings
  }

  // --- Chain Execution Logs ---
  private static readonly MAX_EXECUTION_LOGS = 500

  addChainExecutionLog(log: ChainExecutionLog): ChainExecutionLog {
    this.data.chainExecutionLogs.push(log)
    // Auto-purge oldest beyond limit
    if (this.data.chainExecutionLogs.length > Database.MAX_EXECUTION_LOGS) {
      this.data.chainExecutionLogs = this.data.chainExecutionLogs.slice(-Database.MAX_EXECUTION_LOGS)
    }
    this.scheduleSave()
    return log
  }

  updateChainExecutionLog(id: string, updates: Partial<ChainExecutionLog>): void {
    const log = this.data.chainExecutionLogs.find(l => l.id === id)
    if (log) {
      Object.assign(log, updates)
      this.scheduleSave()
    }
  }

  getChainExecutionLogs(limit = 50): ChainExecutionLog[] {
    return this.data.chainExecutionLogs
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit)
  }

  // Hook execution logs
  addHookExecutionLog(log: HookExecutionLog): void {
    this.data.hookExecutionLogs.push(log)
    if (this.data.hookExecutionLogs.length > Database.MAX_EXECUTION_LOGS) {
      this.data.hookExecutionLogs = this.data.hookExecutionLogs.slice(-Database.MAX_EXECUTION_LOGS)
    }
    this.scheduleSave()
  }

  getHookExecutionLogs(limit = 50, event?: string): HookExecutionLog[] {
    let logs = this.data.hookExecutionLogs
    if (event) {
      logs = logs.filter(l => l.event === event)
    }
    return logs
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, limit)
  }

  getScheduledChains(): TaskChain[] {
    return this.data.taskChains.filter(c => c.isActive && c.triggerCondition.type === 'scheduled')
  }

  close(): void {
    // Flush any pending debounced save immediately on exit
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.dirty = false
    this.save()
  }

  // Prompt Templates
  createTemplate(params: { label: string; value: string; category: string }): PromptTemplate {
    const template: PromptTemplate = {
      id: uuidv4(),
      label: params.label,
      value: params.value,
      category: params.category,
      isBuiltIn: false,
      createdAt: new Date().toISOString()
    }
    this.data.promptTemplates.push(template)
    this.scheduleSave()
    return template
  }

  getTemplates(): PromptTemplate[] {
    return this.data.promptTemplates
  }

  updateTemplate(id: string, updates: Partial<PromptTemplate>): PromptTemplate {
    const tmpl = this.data.promptTemplates.find((t) => t.id === id)
    if (!tmpl) throw new Error(`Template ${id} not found`)
    const allowedFields = ['label', 'value', 'category']
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        ;(tmpl as unknown as Record<string, unknown>)[key] = value
      }
    }
    this.scheduleSave()
    return tmpl
  }

  deleteTemplate(id: string): void {
    this.data.promptTemplates = this.data.promptTemplates.filter((t) => t.id !== id)
    this.scheduleSave()
  }

  // --- Agent Definitions ---
  getAgentTemplates(): AgentDefinition[] {
    return this.data.agentTemplates
  }

  createAgentTemplate(params: { name: string; icon?: string | null; roleLabel?: string | null; description: string; defaultProjectPath?: string | null; systemPrompt?: string | null; skills?: string[] }): AgentDefinition {
    const tmpl: AgentDefinition = {
      id: uuidv4(),
      name: params.name,
      icon: params.icon ?? null,
      roleLabel: params.roleLabel ?? null,
      description: params.description,
      defaultProjectPath: params.defaultProjectPath ?? null,
      systemPrompt: params.systemPrompt ?? null,
      skills: params.skills ?? [],
      createdAt: new Date().toISOString()
    }
    this.data.agentTemplates.push(tmpl)
    this.scheduleSave()
    return tmpl
  }

  deleteAgentTemplate(id: string): void {
    this.data.agentTemplates = this.data.agentTemplates.filter((t) => t.id !== id)
    this.scheduleSave()
  }
}
