import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ClaudeMcpServer, ClaudeHook } from './configTypes'

export function readGlobalMcpServers(): ClaudeMcpServer[] {
  const home = homedir()
  const claudeDir = join(home, '.claude')
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
    } catch {
      /* */
    }
  }

  // Also check ~/.claude.json for MCP servers
  const claudeJsonPath = join(home, '.claude.json')
  if (existsSync(claudeJsonPath)) {
    try {
      const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'))
      const servers = claudeJson.mcpServers ?? {}
      const existingNames = new Set(mcpServers.map((s) => s.name))
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
    } catch {
      /* */
    }
  }

  return mcpServers
}

export function readProjectMcpServers(projectPath: string): ClaudeMcpServer[] {
  const projectMcpPath = join(projectPath, '.mcp.json')
  const mcpServers: ClaudeMcpServer[] = []

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
      /* */
    }
  }

  return mcpServers
}

export function readHooks(): ClaudeHook[] {
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')
  const hooks: ClaudeHook[] = []

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
    } catch {
      /* */
    }
  }

  return hooks
}
