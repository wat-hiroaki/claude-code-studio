import { v4 as uuidv4 } from 'uuid'
import { basename } from 'path'
import type { Workspace, WorkspaceProject, CreateWorkspaceParams } from '@shared/types'
import type { DatabaseInternals } from './types'

export function createWorkspace(db: DatabaseInternals, params: CreateWorkspaceParams): Workspace {
  const now = new Date().toISOString()
  const projects: WorkspaceProject[] = (params.projects ?? []).map(p => ({
    path: p.path,
    name: p.name || basename(p.path.replace(/\\/g, '/')) || p.path,
    addedAt: now
  }))
  const workspace: Workspace = {
    id: uuidv4(),
    name: params.name,
    path: projects[0]?.path ?? '',
    projects,
    color: params.color ?? '#748ffc',
    connectionType: params.connectionType,
    sshConfig: params.sshConfig,
    configStorageLocation: 'local',
    isActive: false,
    createdAt: now,
    updatedAt: now
  }
  db._data.workspaces.push(workspace)
  db._scheduleSave()
  return workspace
}

export function getWorkspaces(db: DatabaseInternals): Workspace[] {
  return db._data.workspaces
}

export function updateWorkspace(db: DatabaseInternals, id: string, updates: Partial<Workspace>): Workspace {
  const ws = db._data.workspaces.find((w) => w.id === id)
  if (!ws) throw new Error(`Workspace ${id} not found`)

  const allowedFields = ['name', 'path', 'color', 'connectionType', 'sshConfig', 'configStorageLocation', 'isActive', 'projects']
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      // eslint-disable-next-line no-extra-semi
      ;(ws as unknown as Record<string, unknown>)[key] = value
    }
  }
  ws.updatedAt = new Date().toISOString()
  db._scheduleSave()
  return ws
}

export function addProjectToWorkspace(db: DatabaseInternals, wsId: string, project: { path: string; name: string }): Workspace {
  const ws = db._data.workspaces.find((w) => w.id === wsId)
  if (!ws) throw new Error(`Workspace ${wsId} not found`)
  // Duplicate check
  if (ws.projects.some(p => p.path === project.path)) {
    throw new Error(`Project path "${project.path}" already exists in workspace`)
  }
  ws.projects.push({
    path: project.path,
    name: project.name || basename(project.path.replace(/\\/g, '/')) || project.path,
    addedAt: new Date().toISOString()
  })
  // Keep legacy path in sync with first project
  if (ws.projects.length === 1) {
    ws.path = project.path
  }
  ws.updatedAt = new Date().toISOString()
  db._scheduleSave()
  return ws
}

export function removeProjectFromWorkspace(db: DatabaseInternals, wsId: string, projectPath: string): Workspace {
  const ws = db._data.workspaces.find((w) => w.id === wsId)
  if (!ws) throw new Error(`Workspace ${wsId} not found`)
  ws.projects = ws.projects.filter(p => p.path !== projectPath)
  // Keep legacy path in sync
  ws.path = ws.projects[0]?.path ?? ''
  ws.updatedAt = new Date().toISOString()
  db._scheduleSave()
  return ws
}

export function deleteWorkspace(db: DatabaseInternals, id: string): void {
  db._data.workspaces = db._data.workspaces.filter((w) => w.id !== id)
  if (db._data.activeWorkspaceId === id) {
    db._data.activeWorkspaceId = null
  }
  db._scheduleSave()
}

export function setActiveWorkspace(db: DatabaseInternals, id: string | null): void {
  if (id && !db._data.workspaces.find((w) => w.id === id)) {
    throw new Error(`Workspace ${id} not found`)
  }
  db._data.activeWorkspaceId = id
  db._scheduleSave()
}

export function getActiveWorkspaceId(db: DatabaseInternals): string | null {
  return db._data.activeWorkspaceId
}
