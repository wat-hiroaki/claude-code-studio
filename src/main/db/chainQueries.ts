import { v4 as uuidv4 } from 'uuid'
import type { TaskChain, Broadcast, Team, ChainExecutionLog, HookExecutionLog } from '@shared/types'
import type { DatabaseInternals } from './types'

const MAX_EXECUTION_LOGS = 500

// Task Chains
export function createChain(db: DatabaseInternals, chain: Omit<TaskChain, 'id' | 'createdAt'>): TaskChain {
  const tc: TaskChain = {
    ...chain,
    id: uuidv4(),
    createdAt: new Date().toISOString()
  }
  db._data.taskChains.push(tc)
  db._scheduleSave()
  return tc
}

export function getChains(db: DatabaseInternals): TaskChain[] {
  return db._data.taskChains
}

export function updateChain(db: DatabaseInternals, id: string, updates: Partial<TaskChain>): TaskChain {
  const chain = db._data.taskChains.find((c) => c.id === id)
  if (!chain) throw new Error(`Chain ${id} not found`)
  Object.assign(chain, updates)
  db._scheduleSave()
  return chain
}

export function deleteChain(db: DatabaseInternals, id: string): void {
  db._data.taskChains = db._data.taskChains.filter((c) => c.id !== id)
  db._scheduleSave()
}

export function getScheduledChains(db: DatabaseInternals): TaskChain[] {
  return db._data.taskChains.filter(c => c.isActive && c.triggerCondition.type === 'scheduled')
}

// Broadcasts
export function createBroadcast(db: DatabaseInternals, message: string, agentIds: string[]): string {
  const b: Broadcast = {
    id: uuidv4(),
    messageTemplate: message,
    targetAgentIds: agentIds,
    status: 'pending',
    responses: {},
    createdAt: new Date().toISOString()
  }
  db._data.broadcasts.push(b)
  db._scheduleSave()
  return b.id
}

export function updateBroadcast(db: DatabaseInternals, id: string, updates: Partial<Broadcast>): void {
  const b = db._data.broadcasts.find((br) => br.id === id)
  if (b) {
    Object.assign(b, updates)
    db._scheduleSave()
  }
}

// Teams
export function createTeam(db: DatabaseInternals, name: string, color: string): Team {
  const team: Team = { id: uuidv4(), name, color }
  db._data.teams.push(team)
  db._scheduleSave()
  return team
}

export function getTeams(db: DatabaseInternals): Team[] {
  return db._data.teams
}

export function updateTeam(db: DatabaseInternals, id: string, updates: Partial<Team>): Team {
  const team = db._data.teams.find((t) => t.id === id)
  if (!team) throw new Error(`Team ${id} not found`)
  if (updates.name !== undefined) team.name = updates.name
  if (updates.color !== undefined) team.color = updates.color
  db._scheduleSave()
  return team
}

export function deleteTeam(db: DatabaseInternals, id: string): void {
  db._data.teams = db._data.teams.filter((t) => t.id !== id)
  // Unassign agents from deleted team
  for (const agent of db._data.agents) {
    if (agent.teamId === id) agent.teamId = null
  }
  db._scheduleSave()
}

// Chain Execution Logs
export function addChainExecutionLog(db: DatabaseInternals, log: ChainExecutionLog): ChainExecutionLog {
  db._data.chainExecutionLogs.push(log)
  if (db._data.chainExecutionLogs.length > MAX_EXECUTION_LOGS) {
    db._data.chainExecutionLogs = db._data.chainExecutionLogs.slice(-MAX_EXECUTION_LOGS)
  }
  db._scheduleSave()
  return log
}

export function updateChainExecutionLog(db: DatabaseInternals, id: string, updates: Partial<ChainExecutionLog>): void {
  const log = db._data.chainExecutionLogs.find(l => l.id === id)
  if (log) {
    Object.assign(log, updates)
    db._scheduleSave()
  }
}

export function getChainExecutionLogs(db: DatabaseInternals, limit = 50): ChainExecutionLog[] {
  return db._data.chainExecutionLogs
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit)
}

// Hook Execution Logs
export function addHookExecutionLog(db: DatabaseInternals, log: HookExecutionLog): void {
  db._data.hookExecutionLogs.push(log)
  if (db._data.hookExecutionLogs.length > MAX_EXECUTION_LOGS) {
    db._data.hookExecutionLogs = db._data.hookExecutionLogs.slice(-MAX_EXECUTION_LOGS)
  }
  db._scheduleSave()
}

export function getHookExecutionLogs(db: DatabaseInternals, limit = 50, event?: string): HookExecutionLog[] {
  let logs = db._data.hookExecutionLogs
  if (event) {
    logs = logs.filter(l => l.event === event)
  }
  return logs
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, limit)
}
