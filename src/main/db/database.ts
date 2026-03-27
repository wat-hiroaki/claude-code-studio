import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { basename } from 'path'
import type {
  Agent, Team, Message, TaskChain, Broadcast, CreateAgentParams, TeamStats,
  Workspace, CreateWorkspaceParams, Task, TaskStatus, PromptTemplate,
  AgentDefinition, ChainExecutionLog, HookExecutionLog
} from '@shared/types'
import type { DBData, AppSettings, DatabaseInternals } from './types'

import * as agentQ from './agentQueries'
import * as workspaceQ from './workspaceQueries'
import * as chainQ from './chainQueries'
import * as templateQ from './templateQueries'
import * as taskQ from './taskQueries'

export class Database implements DatabaseInternals {
  _data: DBData
  private dbPath: string
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.dbPath = join(userDataPath, 'database.json')
    this._data = this.load()
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

    // Migrate workspace.path → workspace.projects[]
    for (const ws of raw.workspaces as Record<string, unknown>[]) {
      if (!Array.isArray(ws.projects)) {
        const wsPath = String(ws.path || '')
        if (wsPath) {
          const pathName = basename(wsPath.replace(/\\/g, '/')) || wsPath
          ws.projects = [{
            path: wsPath,
            name: pathName,
            addedAt: String(ws.createdAt || new Date().toISOString())
          }]
        } else {
          ws.projects = []
        }
      }
    }

    return raw as unknown as DBData
  }

  private save(): void {
    // Atomic write: write to temp file then rename
    const tmpPath = this.dbPath + '.tmp'
    const data = JSON.stringify(this._data, null, 2)
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

  _scheduleSave(): void {
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
    return JSON.stringify(this._data, null, 2)
  }

  // Scrollback buffer management (max 50KB per agent)
  saveScrollback(agentId: string, buffer: string): void {
    this._data.sessionScrollbacks[agentId] = buffer.slice(-50000)
    this._scheduleSave()
  }

  getScrollback(agentId: string): string {
    return this._data.sessionScrollbacks[agentId] ?? ''
  }

  saveAllScrollbacks(scrollbacks: Record<string, string>): void {
    for (const [id, buf] of Object.entries(scrollbacks)) {
      this._data.sessionScrollbacks[id] = buf.slice(-50000)
    }
    this._scheduleSave()
  }

  getDbPath(): string {
    return this.dbPath
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.dirty = false
    this.save()
  }

  // --- Agent & Message delegates ---
  createAgent(params: CreateAgentParams): Agent { return agentQ.createAgent(this, params) }
  getAgent(id: string): Agent | null { return agentQ.getAgent(this, id) }
  getAgents(workspaceId?: string | null): Agent[] { return agentQ.getAgents(this, workspaceId) }
  updateAgent(id: string, updates: Record<string, unknown>): Agent { return agentQ.updateAgent(this, id, updates) }
  deleteAgent(id: string): void { agentQ.deleteAgent(this, id) }
  addMessage(agentId: string, role: string, contentType: string, content: string, metadata?: Record<string, unknown>): Message { return agentQ.addMessage(this, agentId, role, contentType, content, metadata) }
  getMessages(agentId: string): Message[] { return agentQ.getMessages(this, agentId) }
  getTeamStats(): TeamStats { return agentQ.getTeamStats(this) }
  getSettings(): AppSettings { return agentQ.getSettings(this) }
  updateSettings(updates: Partial<AppSettings>): AppSettings { return agentQ.updateSettings(this, updates) }

  // --- Workspace delegates ---
  createWorkspace(params: CreateWorkspaceParams): Workspace { return workspaceQ.createWorkspace(this, params) }
  getWorkspaces(): Workspace[] { return workspaceQ.getWorkspaces(this) }
  updateWorkspace(id: string, updates: Partial<Workspace>): Workspace { return workspaceQ.updateWorkspace(this, id, updates) }
  addProjectToWorkspace(wsId: string, project: { path: string; name: string }): Workspace { return workspaceQ.addProjectToWorkspace(this, wsId, project) }
  removeProjectFromWorkspace(wsId: string, projectPath: string): Workspace { return workspaceQ.removeProjectFromWorkspace(this, wsId, projectPath) }
  deleteWorkspace(id: string): void { workspaceQ.deleteWorkspace(this, id) }
  setActiveWorkspace(id: string | null): void { workspaceQ.setActiveWorkspace(this, id) }
  getActiveWorkspaceId(): string | null { return workspaceQ.getActiveWorkspaceId(this) }

  // --- Chain / Broadcast / Team delegates ---
  createChain(chain: Omit<TaskChain, 'id' | 'createdAt'>): TaskChain { return chainQ.createChain(this, chain) }
  getChains(): TaskChain[] { return chainQ.getChains(this) }
  updateChain(id: string, updates: Partial<TaskChain>): TaskChain { return chainQ.updateChain(this, id, updates) }
  deleteChain(id: string): void { chainQ.deleteChain(this, id) }
  getScheduledChains(): TaskChain[] { return chainQ.getScheduledChains(this) }
  createBroadcast(message: string, agentIds: string[]): string { return chainQ.createBroadcast(this, message, agentIds) }
  updateBroadcast(id: string, updates: Partial<Broadcast>): void { chainQ.updateBroadcast(this, id, updates) }
  createTeam(name: string, color: string): Team { return chainQ.createTeam(this, name, color) }
  getTeams(): Team[] { return chainQ.getTeams(this) }
  updateTeam(id: string, updates: Partial<Team>): Team { return chainQ.updateTeam(this, id, updates) }
  deleteTeam(id: string): void { chainQ.deleteTeam(this, id) }
  addChainExecutionLog(log: ChainExecutionLog): ChainExecutionLog { return chainQ.addChainExecutionLog(this, log) }
  updateChainExecutionLog(id: string, updates: Partial<ChainExecutionLog>): void { chainQ.updateChainExecutionLog(this, id, updates) }
  getChainExecutionLogs(limit = 50): ChainExecutionLog[] { return chainQ.getChainExecutionLogs(this, limit) }
  addHookExecutionLog(log: HookExecutionLog): void { chainQ.addHookExecutionLog(this, log) }
  getHookExecutionLogs(limit = 50, event?: string): HookExecutionLog[] { return chainQ.getHookExecutionLogs(this, limit, event) }

  // --- Template delegates ---
  createTemplate(params: { label: string; value: string; category: string }): PromptTemplate { return templateQ.createTemplate(this, params) }
  getTemplates(): PromptTemplate[] { return templateQ.getTemplates(this) }
  updateTemplate(id: string, updates: Partial<PromptTemplate>): PromptTemplate { return templateQ.updateTemplate(this, id, updates) }
  deleteTemplate(id: string): void { templateQ.deleteTemplate(this, id) }
  getAgentTemplates(): AgentDefinition[] { return templateQ.getAgentTemplates(this) }
  createAgentTemplate(params: { name: string; icon?: string | null; roleLabel?: string | null; description: string; defaultProjectPath?: string | null; systemPrompt?: string | null; skills?: string[] }): AgentDefinition { return templateQ.createAgentTemplate(this, params) }
  deleteAgentTemplate(id: string): void { templateQ.deleteAgentTemplate(this, id) }

  // --- Task delegates ---
  createTask(title: string, description?: string, status: TaskStatus = 'todo', agentId?: string): Task { return taskQ.createTask(this, title, description, status, agentId) }
  getTasks(): Task[] { return taskQ.getTasks(this) }
  updateTask(id: string, updates: Partial<Task>): Task { return taskQ.updateTask(this, id, updates) }
  deleteTask(id: string): void { taskQ.deleteTask(this, id) }
}
