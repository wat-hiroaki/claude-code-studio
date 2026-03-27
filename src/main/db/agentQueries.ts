import { v4 as uuidv4 } from 'uuid'
import type { Agent, CreateAgentParams, Message, TeamStats } from '@shared/types'
import type { DatabaseInternals, AppSettings } from './types'

function getNextSessionNumber(db: DatabaseInternals, projectPath: string): number {
  const existing = db._data.agents.filter((a) => a.projectPath === projectPath)
  return existing.length > 0 ? Math.max(...existing.map((a) => a.sessionNumber)) + 1 : 1
}

export function createAgent(db: DatabaseInternals, params: CreateAgentParams): Agent {
  const id = uuidv4()
  const sessionNumber = getNextSessionNumber(db, params.projectPath)
  const now = new Date().toISOString()

  const agent: Agent = {
    id,
    name: params.name,
    icon: null,
    roleLabel: params.roleLabel ?? null,
    workspaceId: params.workspaceId ?? db._data.activeWorkspaceId,
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

  db._data.agents.push(agent)
  db._scheduleSave()
  return agent
}

export function getAgent(db: DatabaseInternals, id: string): Agent | null {
  return db._data.agents.find((a) => a.id === id) ?? null
}

export function getAgents(db: DatabaseInternals, workspaceId?: string | null): Agent[] {
  return db._data.agents
    .filter((a) => a.status !== 'archived')
    .filter((a) => workspaceId === undefined || a.workspaceId === workspaceId)
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
}

export function updateAgent(db: DatabaseInternals, id: string, updates: Record<string, unknown>): Agent {
  const agent = db._data.agents.find((a) => a.id === id)
  if (!agent) throw new Error(`Agent ${id} not found`)

  const allowedFields = ['name', 'icon', 'roleLabel', 'status', 'currentTask', 'systemPrompt', 'claudeSessionId', 'isPinned', 'skills', 'teamId', 'reportTo']
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      // eslint-disable-next-line no-extra-semi
      ;(agent as unknown as Record<string, unknown>)[key] = value
    }
  }
  agent.updatedAt = new Date().toISOString()
  db._scheduleSave()
  return agent
}

export function deleteAgent(db: DatabaseInternals, id: string): void {
  db._data.agents = db._data.agents.filter((a) => a.id !== id)
  db._data.messages = db._data.messages.filter((m) => m.agentId !== id)
  db._scheduleSave()
}

// Messages (capped at 200 per agent to prevent unbounded memory growth)
const MAX_MESSAGES_PER_AGENT = 200

export function addMessage(
  db: DatabaseInternals,
  agentId: string,
  role: string,
  contentType: string,
  content: string,
  metadata?: Record<string, unknown>
): Message {
  const msg: Message = {
    id: db._data.nextMessageId++,
    agentId,
    role: role as Message['role'],
    contentType: contentType as Message['contentType'],
    content,
    metadata: metadata ?? null,
    createdAt: new Date().toISOString()
  }
  db._data.messages.push(msg)

  // Prune oldest messages for this agent if over limit
  const agentMsgs = db._data.messages.filter(m => m.agentId === agentId)
  if (agentMsgs.length > MAX_MESSAGES_PER_AGENT) {
    const toRemove = agentMsgs.length - MAX_MESSAGES_PER_AGENT
    const idsToRemove = new Set(
      agentMsgs
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, toRemove)
        .map(m => m.id)
    )
    db._data.messages = db._data.messages.filter(m => !idsToRemove.has(m.id))
  }

  db._scheduleSave()
  return msg
}

export function getMessages(db: DatabaseInternals, agentId: string): Message[] {
  return db._data.messages
    .filter((m) => m.agentId === agentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export function getTeamStats(db: DatabaseInternals): TeamStats {
  const agents = getAgents(db)
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

// Settings
export function getSettings(db: DatabaseInternals): AppSettings {
  return db._data.settings ?? { usePtyMode: true } as AppSettings
}

export function updateSettings(db: DatabaseInternals, updates: Partial<AppSettings>): AppSettings {
  db._data.settings = { ...getSettings(db), ...updates }
  db._scheduleSave()
  return db._data.settings
}
