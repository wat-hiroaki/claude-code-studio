import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskStatus } from '@shared/types'
import type { DatabaseInternals } from './types'

export function createTask(db: DatabaseInternals, title: string, description?: string, status: TaskStatus = 'todo', agentId?: string): Task {
  const task: Task = {
    id: uuidv4(),
    title,
    description,
    status,
    agentId: agentId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  db._data.tasks.push(task)
  db._scheduleSave()
  return task
}

export function getTasks(db: DatabaseInternals): Task[] {
  return db._data.tasks || []
}

export function updateTask(db: DatabaseInternals, id: string, updates: Partial<Task>): Task {
  const task = db._data.tasks.find(t => t.id === id)
  if (!task) throw new Error(`Task ${id} not found`)

  if (updates.title !== undefined) task.title = updates.title
  if (updates.description !== undefined) task.description = updates.description
  if (updates.status !== undefined) task.status = updates.status
  if (updates.agentId !== undefined) task.agentId = updates.agentId
  task.updatedAt = new Date().toISOString()

  db._scheduleSave()
  return task
}

export function deleteTask(db: DatabaseInternals, id: string): void {
  db._data.tasks = db._data.tasks.filter((t) => t.id !== id)
  db._scheduleSave()
}
