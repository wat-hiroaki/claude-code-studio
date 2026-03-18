import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

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

function safeReadFile(filePath: string, maxChars = 500): string {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.slice(0, maxChars)
  } catch {
    return ''
  }
}

function countLines(filePath: string): number {
  try {
    return readFileSync(filePath, 'utf-8').split('\n').length
  } catch {
    return 0
  }
}

function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

function getLastModified(filePath: string): string {
  try {
    return statSync(filePath).mtime.toISOString()
  } catch {
    return ''
  }
}

export function readAgentProfile(projectPath: string): AgentProfileData {
  const home = homedir()
  const claudeDir = join(home, '.claude')

  // --- Rules (CLAUDE.md files) ---
  const rules: ClaudeRuleFile[] = []

  const globalClaudeMd = join(home, 'CLAUDE.md')
  if (existsSync(globalClaudeMd)) {
    rules.push({
      path: globalClaudeMd,
      name: '~/CLAUDE.md',
      level: 'global',
      lineCount: countLines(globalClaudeMd),
      sizeBytes: getFileSize(globalClaudeMd),
      preview: safeReadFile(globalClaudeMd, 200)
    })
  }

  const globalClaudeDir = join(claudeDir, 'CLAUDE.md')
  if (existsSync(globalClaudeDir)) {
    rules.push({
      path: globalClaudeDir,
      name: '~/.claude/CLAUDE.md',
      level: 'global',
      lineCount: countLines(globalClaudeDir),
      sizeBytes: getFileSize(globalClaudeDir),
      preview: safeReadFile(globalClaudeDir, 200)
    })
  }

  const projectClaudeMd = join(projectPath, 'CLAUDE.md')
  if (existsSync(projectClaudeMd)) {
    rules.push({
      path: projectClaudeMd,
      name: `${basename(projectPath)}/CLAUDE.md`,
      level: 'project',
      lineCount: countLines(projectClaudeMd),
      sizeBytes: getFileSize(projectClaudeMd),
      preview: safeReadFile(projectClaudeMd, 200)
    })
  }

  const projectClaudeSubMd = join(projectPath, '.claude', 'CLAUDE.md')
  if (existsSync(projectClaudeSubMd)) {
    rules.push({
      path: projectClaudeSubMd,
      name: `${basename(projectPath)}/.claude/CLAUDE.md`,
      level: 'project',
      lineCount: countLines(projectClaudeSubMd),
      sizeBytes: getFileSize(projectClaudeSubMd),
      preview: safeReadFile(projectClaudeSubMd, 200)
    })
  }

  // --- Memory ---
  const memory: ClaudeMemoryEntry[] = []
  // Convert project path to Claude's storage format
  const normalizedPath = projectPath.replace(/\\/g, '-').replace(/:/g, '-').replace(/\//g, '-')
  const memoryDir = join(claudeDir, 'projects', normalizedPath, 'memory')

  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter((f) => f.endsWith('.md'))
      for (const file of files) {
        const fullPath = join(memoryDir, file)
        memory.push({
          file,
          lineCount: countLines(fullPath),
          lastModified: getLastModified(fullPath),
          preview: safeReadFile(fullPath, 200)
        })
      }
    } catch {
      // Permission or access error
    }
  }

  // --- Skills & Commands ---
  const skills: ClaudeSkillEntry[] = []

  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      for (const entry of entries) {
        const entryPath = join(skillsDir, entry)
        if (statSync(entryPath).isFile() && entry.endsWith('.md')) {
          skills.push({ name: entry.replace('.md', ''), path: entryPath, type: 'skill' })
        } else if (statSync(entryPath).isDirectory()) {
          skills.push({ name: entry, path: entryPath, type: 'skill' })
        }
      }
    } catch { /* */ }
  }

  const commandsDir = join(claudeDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
      for (const entry of entries) {
        skills.push({
          name: `/${entry.replace('.md', '')}`,
          path: join(commandsDir, entry),
          type: 'command'
        })
      }
    } catch { /* */ }
  }

  const templatesDir = join(claudeDir, 'templates')
  if (existsSync(templatesDir)) {
    try {
      const entries = readdirSync(templatesDir)
      for (const entry of entries) {
        skills.push({
          name: entry,
          path: join(templatesDir, entry),
          type: 'template'
        })
      }
    } catch { /* */ }
  }

  // --- MCP Servers ---
  const mcpServers: ClaudeMcpServer[] = []
  const settingsPath = join(claudeDir, 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const servers = settings.mcpServers ?? {}
      for (const [name, config] of Object.entries(servers)) {
        const cfg = config as Record<string, unknown>
        mcpServers.push({
          name,
          command: String(cfg.command ?? ''),
          args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
          enabled: cfg.disabled !== true
        })
      }
    } catch { /* */ }
  }

  // Also check ~/.claude.json for MCP servers
  const claudeJsonForProfile = join(home, '.claude.json')
  if (existsSync(claudeJsonForProfile)) {
    try {
      const claudeJson = JSON.parse(readFileSync(claudeJsonForProfile, 'utf-8'))
      const servers = claudeJson.mcpServers ?? {}
      const existingNames = new Set(mcpServers.map(s => s.name))
      for (const [name, config] of Object.entries(servers)) {
        if (existingNames.has(name)) continue
        const cfg = config as Record<string, unknown>
        mcpServers.push({
          name,
          command: String(cfg.command ?? ''),
          args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
          enabled: cfg.disabled !== true
        })
      }
    } catch { /* */ }
  }

  // --- Hooks ---
  const hooks: ClaudeHook[] = []
  // Hooks can be in settings.json under "hooks" key
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const hookConfig = settings.hooks ?? {}
      for (const [event, cmds] of Object.entries(hookConfig)) {
        if (Array.isArray(cmds)) {
          for (const cmd of cmds) {
            const c = cmd as Record<string, unknown>
            hooks.push({
              event,
              command: String(c.command ?? c.matcher ?? JSON.stringify(c))
            })
          }
        }
      }
    } catch { /* */ }
  }

  return { rules, memory, skills, mcpServers, hooks }
}

export interface WorkspaceConfigData {
  mcpServers: ClaudeMcpServer[]
  skills: ClaudeSkillEntry[]
  commands: ClaudeSkillEntry[]
  templates: ClaudeSkillEntry[]
  healthStatus: 'healthy' | 'warning' | 'error'
  healthIssues: string[]
}

export function readWorkspaceConfig(projectPath: string): WorkspaceConfigData {
  const home = homedir()
  const claudeDir = join(home, '.claude')
  const healthIssues: string[] = []

  // --- MCP Servers ---
  const mcpServers: ClaudeMcpServer[] = []
  const settingsPath = join(claudeDir, 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const servers = settings.mcpServers ?? {}
      for (const [name, config] of Object.entries(servers)) {
        const cfg = config as Record<string, unknown>
        const command = String(cfg.command ?? '')
        const enabled = cfg.disabled !== true
        mcpServers.push({
          name,
          command,
          args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
          enabled
        })
        // Health check: command exists?
        if (enabled && command && !command.includes('/') && !command.includes('\\')) {
          // Simple command names like 'npx', 'node' — skip existence check
        }
      }
    } catch {
      healthIssues.push('settings.json is corrupted or unreadable')
    }
  }

  // Project-level MCP (.mcp.json)
  const projectMcpPath = join(projectPath, '.mcp.json')
  if (existsSync(projectMcpPath)) {
    try {
      const raw = JSON.parse(readFileSync(projectMcpPath, 'utf-8'))
      const servers = raw.mcpServers ?? {}
      for (const [name, config] of Object.entries(servers)) {
        const cfg = config as Record<string, unknown>
        mcpServers.push({
          name: `[project] ${name}`,
          command: String(cfg.command ?? ''),
          args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
          enabled: cfg.disabled !== true
        })
      }
    } catch {
      healthIssues.push('.mcp.json is corrupted')
    }
  }

  // --- Skills, Commands, Templates ---
  const skills: ClaudeSkillEntry[] = []
  const commands: ClaudeSkillEntry[] = []
  const templates: ClaudeSkillEntry[] = []

  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      for (const entry of entries) {
        const entryPath = join(skillsDir, entry)
        if (statSync(entryPath).isFile() && entry.endsWith('.md')) {
          skills.push({ name: entry.replace('.md', ''), path: entryPath, type: 'skill' })
        } else if (statSync(entryPath).isDirectory()) {
          skills.push({ name: entry, path: entryPath, type: 'skill' })
        }
      }
    } catch { /* */ }
  }

  const commandsDir = join(claudeDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
      for (const entry of entries) {
        commands.push({
          name: `/${entry.replace('.md', '')}`,
          path: join(commandsDir, entry),
          type: 'command'
        })
      }
    } catch { /* */ }
  }

  const templatesDir = join(claudeDir, 'templates')
  if (existsSync(templatesDir)) {
    try {
      const entries = readdirSync(templatesDir)
      for (const entry of entries) {
        templates.push({
          name: entry,
          path: join(templatesDir, entry),
          type: 'template'
        })
      }
    } catch { /* */ }
  }

  // Check for CLAUDE.md
  if (!existsSync(join(projectPath, 'CLAUDE.md')) && !existsSync(join(projectPath, '.claude', 'CLAUDE.md'))) {
    healthIssues.push('No CLAUDE.md found in project')
  }

  const healthStatus = healthIssues.some(i => i.includes('corrupted') || i.includes('error'))
    ? 'error' as const
    : healthIssues.length > 0 ? 'warning' as const : 'healthy' as const

  return { mcpServers, skills, commands, templates, healthStatus, healthIssues }
}

export function readGlobalSkills(): ClaudeSkillEntry[] {
  const claudeDir = join(homedir(), '.claude')
  const skills: ClaudeSkillEntry[] = []

  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      for (const entry of entries) {
        const entryPath = join(skillsDir, entry)
        if (statSync(entryPath).isFile() && entry.endsWith('.md')) {
          skills.push({ name: entry.replace('.md', ''), path: entryPath, type: 'skill' })
        } else if (statSync(entryPath).isDirectory()) {
          skills.push({ name: entry, path: entryPath, type: 'skill' })
        }
      }
    } catch { /* */ }
  }

  return skills
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

export function readAgentTeamsData(): AgentTeamsData {
  const home = homedir()
  const tasksDir = join(home, '.claude', 'tasks')
  const teamsDir = join(home, '.claude', 'teams')

  const taskSessions: AgentTeamsData['taskSessions'] = []
  const teamConfigs: AgentTeamsData['teamConfigs'] = []

  // Scan ~/.claude/tasks/
  if (existsSync(tasksDir)) {
    try {
      const entries = readdirSync(tasksDir)
      // Get mtime for sorting, limit to 100 most recent
      const withMtime = entries
        .map((entry) => {
          const entryPath = join(tasksDir, entry)
          try {
            const stat = statSync(entryPath)
            if (!stat.isDirectory()) return null
            return { name: entry, path: entryPath, mtime: stat.mtime }
          } catch {
            return null
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 100)

      for (const entry of withMtime) {
        const lockPath = join(entry.path, '.lock')
        const hwmPath = join(entry.path, '.highwatermark')

        let isLocked = false
        let highwatermark = 0
        let lastModified = entry.mtime.toISOString()

        if (existsSync(lockPath)) {
          try {
            const lockStat = statSync(lockPath)
            isLocked = lockStat.size > 0
          } catch { /* */ }
        }

        if (existsSync(hwmPath)) {
          try {
            const hwmContent = readFileSync(hwmPath, 'utf-8').trim()
            highwatermark = parseInt(hwmContent, 10) || 0
            const hwmStat = statSync(hwmPath)
            lastModified = hwmStat.mtime.toISOString()
          } catch { /* */ }
        }

        taskSessions.push({
          sessionId: entry.name,
          isLocked,
          highwatermark,
          lastModified
        })
      }
    } catch { /* */ }
  }

  // Scan ~/.claude/teams/
  if (existsSync(teamsDir)) {
    try {
      const entries = readdirSync(teamsDir)
      for (const entry of entries) {
        const configPath = join(teamsDir, entry, 'config.json')
        if (existsSync(configPath)) {
          try {
            const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
            teamConfigs.push({
              teamName: String(raw.name ?? entry),
              members: Array.isArray(raw.members) ? raw.members.map(String) : [],
              metadata: typeof raw === 'object' ? raw : {}
            })
          } catch { /* */ }
        }
      }
    } catch { /* */ }
  }

  return {
    taskSessions,
    teamConfigs,
    lastScannedAt: new Date().toISOString()
  }
}

export function readFileContent(filePath: string): string {
  try {
    const stats = statSync(filePath)
    if (stats.size > 1024 * 1024) return '[File too large to display]'
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

// --- Config Map ---

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

function parseSimpleFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!content.startsWith('---')) return result
  const endIdx = content.indexOf('---', 3)
  if (endIdx === -1) return result
  const block = content.slice(3, endIdx).trim()
  for (const line of block.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value) result[key] = value
  }
  return result
}

export function readSubagentDefinitions(projectPath: string): SubagentDefinition[] {
  const agentsDir = join(projectPath, '.claude', 'agents')
  const definitions: SubagentDefinition[] = []
  if (!existsSync(agentsDir)) return definitions
  try {
    const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const fullPath = join(agentsDir, file)
      const content = safeReadFile(fullPath, 2000)
      const fm = parseSimpleFrontmatter(content)
      definitions.push({
        name: fm['name'] || file.replace('.md', ''),
        description: fm['description'] || '',
        filePath: fullPath,
        tools: fm['tools'] ? fm['tools'].split(',').map(s => s.trim()) : [],
        model: fm['model'] || '',
        skills: fm['skills'] ? fm['skills'].split(',').map(s => s.trim()) : [],
        lineCount: countLines(fullPath),
        sizeBytes: getFileSize(fullPath),
        preview: safeReadFile(fullPath, 200)
      })
    }
  } catch { /* */ }
  return definitions
}

import type { ConfigNode, ConfigEdge, ConfigConflict, ConfigMapData, WorkspaceConfigSummary, ConfigNodeCategory } from '@shared/types'

export function readConfigMapData(projectPath: string): ConfigMapData {
  const home = homedir()
  const claudeDir = join(home, '.claude')
  const projectName = basename(projectPath)
  const nodes: ConfigNode[] = []
  const edges: ConfigEdge[] = []
  const conflicts: ConfigConflict[] = []

  let nodeCounter = 0
  const makeId = (prefix: string): string => `${prefix}-${++nodeCounter}`

  // --- CLAUDE.md nodes (4 locations) ---
  const ruleLocations: { path: string; name: string; level: 'global' | 'project' }[] = [
    { path: join(home, 'CLAUDE.md'), name: '~/CLAUDE.md', level: 'global' },
    { path: join(claudeDir, 'CLAUDE.md'), name: '~/.claude/CLAUDE.md', level: 'global' },
    { path: join(projectPath, 'CLAUDE.md'), name: `${projectName}/CLAUDE.md`, level: 'project' },
    { path: join(projectPath, '.claude', 'CLAUDE.md'), name: `${projectName}/.claude/CLAUDE.md`, level: 'project' }
  ]

  const ruleNodeIds: { id: string; level: 'global' | 'project' }[] = []
  for (const loc of ruleLocations) {
    if (existsSync(loc.path)) {
      const id = makeId('rules')
      nodes.push({
        id,
        label: loc.name,
        category: 'rules',
        level: loc.level,
        filePath: loc.path,
        lineCount: countLines(loc.path),
        sizeBytes: getFileSize(loc.path),
        preview: safeReadFile(loc.path, 200),
        metadata: {}
      })
      ruleNodeIds.push({ id, level: loc.level })
    }
  }

  // Edges: global CLAUDE.md → project CLAUDE.md (inherits)
  const globalRuleIds = ruleNodeIds.filter(r => r.level === 'global')
  const projectRuleIds = ruleNodeIds.filter(r => r.level === 'project')
  for (const g of globalRuleIds) {
    for (const p of projectRuleIds) {
      edges.push({ from: g.id, to: p.id, relationship: 'inherits' })
    }
  }

  // Conflict: if all 4 CLAUDE.md exist
  if (ruleNodeIds.length >= 4) {
    conflicts.push({
      nodeIds: ruleNodeIds.map(r => r.id),
      type: 'override_rule',
      description: 'CLAUDE.md exists in all 4 locations — review for redundancy'
    })
  }

  // --- settings.json node ---
  const settingsPath = join(claudeDir, 'settings.json')
  let settingsNodeId: string | null = null
  if (existsSync(settingsPath)) {
    settingsNodeId = makeId('settings')
    nodes.push({
      id: settingsNodeId,
      label: 'settings.json',
      category: 'settings',
      level: 'global',
      filePath: settingsPath,
      lineCount: countLines(settingsPath),
      sizeBytes: getFileSize(settingsPath),
      preview: safeReadFile(settingsPath, 200),
      metadata: {}
    })
  }

  // --- MCP servers (global: settings.json + ~/.claude.json + project) ---
  const globalMcpNames: string[] = []
  const projectMcpNames: string[] = []

  // Check settings.json for MCP servers
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const servers = settings.mcpServers ?? {}
      const names = Object.keys(servers)
      if (names.length > 0) {
        const id = makeId('mcp')
        nodes.push({
          id,
          label: `Global MCP (${names.length})`,
          category: 'mcpServers',
          level: 'global',
          filePath: settingsPath,
          lineCount: 0,
          sizeBytes: 0,
          preview: names.join(', '),
          metadata: { servers: names }
        })
        globalMcpNames.push(...names)
        if (settingsNodeId) {
          edges.push({ from: settingsNodeId, to: id, relationship: 'configures' })
        }
      }
    } catch { /* */ }
  }

  // Check ~/.claude.json for MCP servers (Claude Code stores them here)
  const claudeJsonPath = join(home, '.claude.json')
  if (existsSync(claudeJsonPath)) {
    try {
      const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'))
      const servers = claudeJson.mcpServers ?? {}
      const names = Object.keys(servers).filter(n => !globalMcpNames.includes(n))
      if (names.length > 0) {
        const id = makeId('mcp')
        nodes.push({
          id,
          label: `Claude MCP (${names.length})`,
          category: 'mcpServers',
          level: 'global',
          filePath: claudeJsonPath,
          lineCount: countLines(claudeJsonPath),
          sizeBytes: getFileSize(claudeJsonPath),
          preview: names.join(', '),
          metadata: { servers: names }
        })
        globalMcpNames.push(...names)
      }
    } catch { /* */ }
  }

  const projectMcpPath = join(projectPath, '.mcp.json')
  if (existsSync(projectMcpPath)) {
    try {
      const raw = JSON.parse(readFileSync(projectMcpPath, 'utf-8'))
      const servers = raw.mcpServers ?? {}
      const names = Object.keys(servers)
      if (names.length > 0) {
        const id = makeId('mcp')
        nodes.push({
          id,
          label: `Project MCP (${names.length})`,
          category: 'mcpServers',
          level: 'project',
          filePath: projectMcpPath,
          lineCount: countLines(projectMcpPath),
          sizeBytes: getFileSize(projectMcpPath),
          preview: names.join(', '),
          metadata: { servers: names }
        })
        projectMcpNames.push(...names)
      }
    } catch { /* */ }
  }

  // MCP conflict detection: same name in global + project
  const duplicateMcp = globalMcpNames.filter(n => projectMcpNames.includes(n))
  if (duplicateMcp.length > 0) {
    const mcpNodes = nodes.filter(n => n.category === 'mcpServers')
    conflicts.push({
      nodeIds: mcpNodes.map(n => n.id),
      type: 'duplicate_mcp',
      description: `Duplicate MCP server(s): ${duplicateMcp.join(', ')}`
    })
  }

  // --- Hooks ---
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const hookConfig = settings.hooks ?? {}
      const hookEvents = Object.keys(hookConfig)
      if (hookEvents.length > 0) {
        const id = makeId('hooks')
        nodes.push({
          id,
          label: `Hooks (${hookEvents.length} events)`,
          category: 'hooks',
          level: 'global',
          filePath: settingsPath,
          lineCount: 0,
          sizeBytes: 0,
          preview: hookEvents.join(', '),
          metadata: { events: hookEvents }
        })
        if (settingsNodeId) {
          edges.push({ from: settingsNodeId, to: id, relationship: 'configures' })
        }
      }
    } catch { /* */ }
  }

  // --- Skills (grouped) ---
  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      // Group: directories are skill packages, files are individual skills
      const packages = entries.filter(e => {
        try { return statSync(join(skillsDir, e)).isDirectory() } catch { return false }
      })
      const files = entries.filter(e => e.endsWith('.md'))

      if (packages.length > 0 || files.length > 0) {
        const id = makeId('skills')
        const totalCount = packages.length + files.length
        const packageNames = packages.slice(0, 5).join(', ')
        const fileNames = files.slice(0, 5).map(f => f.replace('.md', '')).join(', ')
        nodes.push({
          id,
          label: `Skills (${totalCount})`,
          category: 'skills',
          level: 'global',
          filePath: skillsDir,
          lineCount: 0,
          sizeBytes: 0,
          preview: [packageNames, fileNames].filter(Boolean).join('; '),
          metadata: { packages, files, totalCount }
        })
      }
    } catch { /* */ }
  }

  // --- Commands (grouped) ---
  const commandsDir = join(claudeDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
      if (entries.length > 0) {
        const id = makeId('commands')
        nodes.push({
          id,
          label: `Commands (${entries.length})`,
          category: 'commands',
          level: 'global',
          filePath: commandsDir,
          lineCount: 0,
          sizeBytes: 0,
          preview: entries.slice(0, 8).map(f => `/${f.replace('.md', '')}`).join(', '),
          metadata: { commands: entries.map(f => f.replace('.md', '')) }
        })
      }
    } catch { /* */ }
  }

  // --- Templates (grouped) ---
  const templatesDir = join(claudeDir, 'templates')
  if (existsSync(templatesDir)) {
    try {
      const entries = readdirSync(templatesDir)
      if (entries.length > 0) {
        const id = makeId('templates')
        nodes.push({
          id,
          label: `Templates (${entries.length})`,
          category: 'templates',
          level: 'global',
          filePath: templatesDir,
          lineCount: 0,
          sizeBytes: 0,
          preview: entries.slice(0, 5).join(', '),
          metadata: { templates: entries }
        })
      }
    } catch { /* */ }
  }

  // --- Memory ---
  const normalizedPath = projectPath.replace(/\\/g, '-').replace(/:/g, '-').replace(/\//g, '-')
  const memoryDir = join(claudeDir, 'projects', normalizedPath, 'memory')
  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'))
      if (files.length > 0) {
        const id = makeId('memory')
        nodes.push({
          id,
          label: `Memory (${files.length})`,
          category: 'memory',
          level: 'project',
          filePath: memoryDir,
          lineCount: 0,
          sizeBytes: 0,
          preview: files.slice(0, 5).join(', '),
          metadata: { files }
        })
      }
    } catch { /* */ }
  }

  // --- Subagents ---
  const subagents = readSubagentDefinitions(projectPath)
  const skillsNodeId = nodes.find(n => n.category === 'skills')?.id
  for (const agent of subagents) {
    const id = makeId('agents')
    nodes.push({
      id,
      label: agent.name,
      category: 'agents',
      level: 'agent',
      filePath: agent.filePath,
      lineCount: agent.lineCount,
      sizeBytes: agent.sizeBytes,
      preview: agent.preview,
      metadata: {
        description: agent.description,
        tools: agent.tools,
        model: agent.model,
        skills: agent.skills
      }
    })
    // Edge: agent references skills
    if (agent.skills.length > 0 && skillsNodeId) {
      edges.push({ from: id, to: skillsNodeId, relationship: 'references' })
    }
  }

  return {
    projectPath,
    projectName,
    nodes,
    edges,
    conflicts,
    scannedAt: new Date().toISOString()
  }
}

export function readWorkspaceConfigSummary(projectPath: string): WorkspaceConfigSummary {
  const data = readConfigMapData(projectPath)
  const nodeCounts = {} as Record<ConfigNodeCategory, number>
  const categories: ConfigNodeCategory[] = ['rules', 'skills', 'commands', 'templates', 'mcpServers', 'hooks', 'memory', 'agents', 'settings']
  for (const cat of categories) {
    nodeCounts[cat] = data.nodes.filter(n => n.category === cat).length
  }
  const agentNames = data.nodes
    .filter(n => n.category === 'agents')
    .map(n => n.label)
  const mcpServerNames = data.nodes
    .filter(n => n.category === 'mcpServers')
    .flatMap(n => Array.isArray(n.metadata.servers) ? n.metadata.servers as string[] : [n.label])
  const hasProjectClaude = data.nodes.some(n => n.category === 'rules' && n.level === 'project')

  return {
    projectPath: data.projectPath,
    projectName: data.projectName,
    nodeCounts,
    totalNodes: data.nodes.length,
    totalEdges: data.edges.length,
    conflictCount: data.conflicts.length,
    agentNames,
    mcpServerNames,
    hasProjectClaude,
    scannedAt: data.scannedAt
  }
}

export function readAllWorkspacesSummary(projectPaths: string[]): WorkspaceConfigSummary[] {
  const results: WorkspaceConfigSummary[] = []
  for (const p of projectPaths) {
    try {
      results.push(readWorkspaceConfigSummary(p))
    } catch {
      // Skip inaccessible workspaces
    }
  }
  return results
}
