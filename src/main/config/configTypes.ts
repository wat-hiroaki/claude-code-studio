import { readFileSync, statSync } from 'fs'

// --- Shared interfaces ---

export interface ClaudeRuleFile {
  path: string
  name: string
  level: 'global' | 'project'
  lineCount: number
  sizeBytes: number
  preview: string
}

export interface ClaudeMemoryEntry {
  file: string
  lineCount: number
  lastModified: string
  preview: string
}

export interface ClaudeSkillEntry {
  name: string
  path: string
  type: 'skill' | 'command' | 'template'
}

export interface ClaudeMcpServer {
  name: string
  command: string
  args: string[]
  enabled: boolean
}

export interface ClaudeHook {
  event: string
  command: string
}

export interface AgentProfileData {
  rules: ClaudeRuleFile[]
  memory: ClaudeMemoryEntry[]
  skills: ClaudeSkillEntry[]
  mcpServers: ClaudeMcpServer[]
  hooks: ClaudeHook[]
}

export interface WorkspaceConfigData {
  mcpServers: ClaudeMcpServer[]
  skills: ClaudeSkillEntry[]
  commands: ClaudeSkillEntry[]
  templates: ClaudeSkillEntry[]
  healthStatus: 'healthy' | 'warning' | 'error'
  healthIssues: string[]
}

export interface AgentTeamsData {
  taskSessions: Array<{
    sessionId: string
    isLocked: boolean
    highwatermark: number
    lastModified: string
  }>
  teamConfigs: Array<{
    teamName: string
    members: string[]
    metadata: Record<string, unknown>
  }>
  lastScannedAt: string
}

export interface SubagentDefinition {
  name: string
  description: string
  filePath: string
  tools: string[]
  model: string
  skills: string[]
  lineCount: number
  sizeBytes: number
  preview: string
}

// --- Shared utility functions ---

export function safeReadFile(filePath: string, maxChars = 500): string {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.slice(0, maxChars)
  } catch {
    return ''
  }
}

export function countLines(filePath: string): number {
  try {
    return readFileSync(filePath, 'utf-8').split('\n').length
  } catch {
    return 0
  }
}

export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

export function getLastModified(filePath: string): string {
  try {
    return statSync(filePath).mtime.toISOString()
  } catch {
    return ''
  }
}
