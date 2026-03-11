import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, Team, Message, TaskChain, Broadcast, CreateAgentParams, TeamStats, Workspace, CreateWorkspaceParams } from '@shared/types'

interface AppSettings {
  usePtyMode: boolean
}

interface DBData {
  agents: Agent[]
  teams: Team[]
  messages: Message[]
  taskChains: TaskChain[]
  broadcasts: Broadcast[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  settings: AppSettings
  nextMessageId: number
}

export class Database {
  private data: DBData
  private dbPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.dbPath = join(userDataPath, 'database.json')
    this.data = this.load()
  }

  private load(): DBData {
    if (existsSync(this.dbPath)) {
      try {
        return JSON.parse(readFileSync(this.dbPath, 'utf-8'))
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
      activeWorkspaceId: null,
      settings: { usePtyMode: true },
      nextMessageId: 1
    }
  }

  private save(): void {
    // Atomic write: write to temp file then rename
    const tmpPath = this.dbPath + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmpPath, this.dbPath)
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
      workspaceId: this.data.activeWorkspaceId,
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
      createdAt: now,
      updatedAt: now
    }

    this.data.agents.push(agent)
    this.save()
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
        (agent as Record<string, unknown>)[key] = value
      }
    }
    agent.updatedAt = new Date().toISOString()
    this.save()
    return agent
  }

  // Messages
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
    this.save()
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
    this.save()
    return tc
  }

  getChains(): TaskChain[] {
    return this.data.taskChains
  }

  updateChain(id: string, updates: Partial<TaskChain>): TaskChain {
    const chain = this.data.taskChains.find((c) => c.id === id)
    if (!chain) throw new Error(`Chain ${id} not found`)
    Object.assign(chain, updates)
    this.save()
    return chain
  }

  deleteChain(id: string): void {
    this.data.taskChains = this.data.taskChains.filter((c) => c.id !== id)
    this.save()
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
    this.save()
    return b.id
  }

  updateBroadcast(id: string, updates: Partial<Broadcast>): void {
    const b = this.data.broadcasts.find((br) => br.id === id)
    if (b) {
      Object.assign(b, updates)
      this.save()
    }
  }

  // Teams
  createTeam(name: string, color: string): Team {
    const team: Team = { id: uuidv4(), name, color }
    this.data.teams.push(team)
    this.save()
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
    this.save()
    return team
  }

  deleteTeam(id: string): void {
    this.data.teams = this.data.teams.filter((t) => t.id !== id)
    // Unassign agents from deleted team
    for (const agent of this.data.agents) {
      if (agent.teamId === id) agent.teamId = null
    }
    this.save()
  }

  // Team Stats
  getTeamStats(): TeamStats {
    const agents = this.getAgents()
    const today = new Date().toISOString().slice(0, 10)
    const completedToday = agents.filter(
      (a) => a.status === 'idle' && a.updatedAt.startsWith(today)
    ).length
    return {
      active: agents.filter((a) => ['active', 'thinking', 'tool_running'].includes(a.status)).length,
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
      color: params.color ?? '#748ffc',
      connectionType: params.connectionType,
      sshConfig: params.sshConfig,
      configStorageLocation: 'local',
      isActive: false,
      createdAt: now,
      updatedAt: now
    }
    this.data.workspaces.push(workspace)
    this.save()
    return workspace
  }

  getWorkspaces(): Workspace[] {
    return this.data.workspaces
  }

  updateWorkspace(id: string, updates: Partial<Workspace>): Workspace {
    const ws = this.data.workspaces.find((w) => w.id === id)
    if (!ws) throw new Error(`Workspace ${id} not found`)
    const allowedFields = ['name', 'color', 'connectionType', 'sshConfig', 'configStorageLocation', 'isActive']
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        (ws as Record<string, unknown>)[key] = value
      }
    }
    ws.updatedAt = new Date().toISOString()
    this.save()
    return ws
  }

  deleteWorkspace(id: string): void {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    if (this.data.activeWorkspaceId === id) {
      this.data.activeWorkspaceId = null
    }
    this.save()
  }

  setActiveWorkspace(id: string | null): void {
    if (id && !this.data.workspaces.find((w) => w.id === id)) {
      throw new Error(`Workspace ${id} not found`)
    }
    this.data.activeWorkspaceId = id
    this.save()
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
    this.save()
    return this.data.settings
  }

  close(): void {
    this.save()
  }
}
