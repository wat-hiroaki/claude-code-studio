import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type {
  ConfigNode,
  ConfigEdge,
  ConfigConflict,
  ConfigMapData,
  WorkspaceConfigSummary,
  ConfigNodeCategory
} from '@shared/types'
import type {
  WorkspaceConfigData,
  ClaudeMcpServer,
  ClaudeSkillEntry,
  SubagentDefinition
} from './configTypes'
import { countLines, getFileSize, safeReadFile } from './configTypes'
import { readSkillsAndCommands } from './permissionsParser'

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
  const { skills, commands, templates } = readSkillsAndCommands(claudeDir)

  // Check for CLAUDE.md
  if (
    !existsSync(join(projectPath, 'CLAUDE.md')) &&
    !existsSync(join(projectPath, '.claude', 'CLAUDE.md'))
  ) {
    healthIssues.push('No CLAUDE.md found in project')
  }

  const healthStatus = healthIssues.some((i) => i.includes('corrupted') || i.includes('error'))
    ? ('error' as const)
    : healthIssues.length > 0
      ? ('warning' as const)
      : ('healthy' as const)

  return { mcpServers, skills, commands, templates, healthStatus, healthIssues }
}

export function readGlobalSkills(): ClaudeSkillEntry[] {
  const claudeDir = join(homedir(), '.claude')
  const { skills } = readSkillsAndCommands(claudeDir)
  return skills
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
    const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      const fullPath = join(agentsDir, file)
      const content = safeReadFile(fullPath, 2000)
      const fm = parseSimpleFrontmatter(content)
      definitions.push({
        name: fm['name'] || file.replace('.md', ''),
        description: fm['description'] || '',
        filePath: fullPath,
        tools: fm['tools'] ? fm['tools'].split(',').map((s) => s.trim()) : [],
        model: fm['model'] || '',
        skills: fm['skills'] ? fm['skills'].split(',').map((s) => s.trim()) : [],
        lineCount: countLines(fullPath),
        sizeBytes: getFileSize(fullPath),
        preview: safeReadFile(fullPath, 200)
      })
    }
  } catch {
    /* */
  }
  return definitions
}

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
    {
      path: join(projectPath, 'CLAUDE.md'),
      name: `${projectName}/CLAUDE.md`,
      level: 'project'
    },
    {
      path: join(projectPath, '.claude', 'CLAUDE.md'),
      name: `${projectName}/.claude/CLAUDE.md`,
      level: 'project'
    }
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

  // Edges: global CLAUDE.md -> project CLAUDE.md (inherits)
  const globalRuleIds = ruleNodeIds.filter((r) => r.level === 'global')
  const projectRuleIds = ruleNodeIds.filter((r) => r.level === 'project')
  for (const g of globalRuleIds) {
    for (const p of projectRuleIds) {
      edges.push({ from: g.id, to: p.id, relationship: 'inherits' })
    }
  }

  // Conflict: if all 4 CLAUDE.md exist
  if (ruleNodeIds.length >= 4) {
    conflicts.push({
      nodeIds: ruleNodeIds.map((r) => r.id),
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
    } catch {
      /* */
    }
  }

  // Check ~/.claude.json for MCP servers
  const claudeJsonPath = join(home, '.claude.json')
  if (existsSync(claudeJsonPath)) {
    try {
      const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'))
      const servers = claudeJson.mcpServers ?? {}
      const names = Object.keys(servers).filter((n) => !globalMcpNames.includes(n))
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
    } catch {
      /* */
    }
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
    } catch {
      /* */
    }
  }

  // MCP conflict detection: same name in global + project
  const duplicateMcp = globalMcpNames.filter((n) => projectMcpNames.includes(n))
  if (duplicateMcp.length > 0) {
    const mcpNodes = nodes.filter((n) => n.category === 'mcpServers')
    conflicts.push({
      nodeIds: mcpNodes.map((n) => n.id),
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
    } catch {
      /* */
    }
  }

  // --- Skills (grouped) ---
  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      const packages = entries.filter((e) => {
        try {
          return statSync(join(skillsDir, e)).isDirectory()
        } catch {
          return false
        }
      })
      const files = entries.filter((e) => e.endsWith('.md'))

      if (packages.length > 0 || files.length > 0) {
        const id = makeId('skills')
        const totalCount = packages.length + files.length
        const packageNames = packages.slice(0, 5).join(', ')
        const fileNames = files
          .slice(0, 5)
          .map((f) => f.replace('.md', ''))
          .join(', ')
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
    } catch {
      /* */
    }
  }

  // --- Commands (grouped) ---
  const commandsDir = join(claudeDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
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
          preview: entries
            .slice(0, 8)
            .map((f) => `/${f.replace('.md', '')}`)
            .join(', '),
          metadata: { commands: entries.map((f) => f.replace('.md', '')) }
        })
      }
    } catch {
      /* */
    }
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
    } catch {
      /* */
    }
  }

  // --- Memory ---
  const normalizedPath = projectPath
    .replace(/\\/g, '-')
    .replace(/:/g, '-')
    .replace(/\//g, '-')
  const memoryDir = join(claudeDir, 'projects', normalizedPath, 'memory')
  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter((f) => f.endsWith('.md'))
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
    } catch {
      /* */
    }
  }

  // --- Subagents ---
  const subagents = readSubagentDefinitions(projectPath)
  const skillsNodeId = nodes.find((n) => n.category === 'skills')?.id
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
  const categories: ConfigNodeCategory[] = [
    'rules',
    'skills',
    'commands',
    'templates',
    'mcpServers',
    'hooks',
    'memory',
    'agents',
    'settings'
  ]
  for (const cat of categories) {
    nodeCounts[cat] = data.nodes.filter((n) => n.category === cat).length
  }
  const agentNames = data.nodes.filter((n) => n.category === 'agents').map((n) => n.label)
  const mcpServerNames = data.nodes
    .filter((n) => n.category === 'mcpServers')
    .flatMap((n) =>
      Array.isArray(n.metadata.servers) ? (n.metadata.servers as string[]) : [n.label]
    )
  const hasProjectClaude = data.nodes.some((n) => n.category === 'rules' && n.level === 'project')

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
