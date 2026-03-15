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

export function readFileContent(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}
