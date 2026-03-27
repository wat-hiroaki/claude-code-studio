import { v4 as uuidv4 } from 'uuid'
import type { PromptTemplate, AgentDefinition } from '@shared/types'
import type { DatabaseInternals } from './types'

// Prompt Templates
export function createTemplate(db: DatabaseInternals, params: { label: string; value: string; category: string }): PromptTemplate {
  const template: PromptTemplate = {
    id: uuidv4(),
    label: params.label,
    value: params.value,
    category: params.category,
    isBuiltIn: false,
    createdAt: new Date().toISOString()
  }
  db._data.promptTemplates.push(template)
  db._scheduleSave()
  return template
}

export function getTemplates(db: DatabaseInternals): PromptTemplate[] {
  return db._data.promptTemplates
}

export function updateTemplate(db: DatabaseInternals, id: string, updates: Partial<PromptTemplate>): PromptTemplate {
  const tmpl = db._data.promptTemplates.find((t) => t.id === id)
  if (!tmpl) throw new Error(`Template ${id} not found`)
  const allowedFields = ['label', 'value', 'category']
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      ;(tmpl as unknown as Record<string, unknown>)[key] = value
    }
  }
  db._scheduleSave()
  return tmpl
}

export function deleteTemplate(db: DatabaseInternals, id: string): void {
  db._data.promptTemplates = db._data.promptTemplates.filter((t) => t.id !== id)
  db._scheduleSave()
}

// Agent Definitions
export function getAgentTemplates(db: DatabaseInternals): AgentDefinition[] {
  return db._data.agentTemplates
}

export function createAgentTemplate(
  db: DatabaseInternals,
  params: {
    name: string
    icon?: string | null
    roleLabel?: string | null
    description: string
    defaultProjectPath?: string | null
    systemPrompt?: string | null
    skills?: string[]
  }
): AgentDefinition {
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
  db._data.agentTemplates.push(tmpl)
  db._scheduleSave()
  return tmpl
}

export function deleteAgentTemplate(db: DatabaseInternals, id: string): void {
  db._data.agentTemplates = db._data.agentTemplates.filter((t) => t.id !== id)
  db._scheduleSave()
}
