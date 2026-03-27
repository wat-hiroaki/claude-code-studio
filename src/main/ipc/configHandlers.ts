import { ipcMain } from 'electron'
import { join } from 'path'
import type { Database } from '@main/database'
import { readConfigMapData, readAllWorkspacesSummary } from '@main/config'

interface ConfigHandlerDeps {
  database: Database
}

export function registerConfigHandlers(deps: ConfigHandlerDeps): void {
  const { database } = deps

  // MCP config
  ipcMain.handle('config:getMcp', async (_event, scope: string, projectPath?: string) => {
    const { existsSync, readFileSync } = await import('fs')
    const { homedir } = await import('os')
    let configPath: string
    if (scope === 'project' && projectPath) {
      configPath = join(projectPath, '.mcp.json')
    } else {
      configPath = join(homedir(), '.claude', 'settings.json')
    }
    if (!existsSync(configPath)) return { mcpServers: {} }
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { mcpServers: raw.mcpServers ?? {} }
    } catch {
      return { mcpServers: {} }
    }
  })

  ipcMain.handle('config:updateMcp', async (_event, scope: string, config: { mcpServers: Record<string, unknown> }, projectPath?: string) => {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs')
    const { homedir } = await import('os')
    const { dirname } = await import('path')
    let configPath: string
    if (scope === 'project' && projectPath) {
      if (!existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`)
      }
      configPath = join(projectPath, '.mcp.json')
    } else {
      configPath = join(homedir(), '.claude', 'settings.json')
    }
    let existing: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      try { existing = JSON.parse(readFileSync(configPath, 'utf-8')) } catch { /* ignore */ }
    }
    existing.mcpServers = config.mcpServers
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8')
  })

  // CLAUDE.md
  ipcMain.handle('config:getClaudeMd', async (_event, projectPath: string) => {
    const { existsSync, readFileSync } = await import('fs')
    const mdPath = join(projectPath, 'CLAUDE.md')
    if (!existsSync(mdPath)) return ''
    return readFileSync(mdPath, 'utf-8')
  })

  ipcMain.handle('config:saveClaudeMd', async (_event, projectPath: string, content: string) => {
    const { existsSync, writeFileSync } = await import('fs')
    if (!existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`)
    }
    const mdPath = join(projectPath, 'CLAUDE.md')
    writeFileSync(mdPath, content, 'utf-8')
  })

  // Permissions
  ipcMain.handle('config:getPermissions', async () => {
    const { existsSync, readFileSync } = await import('fs')
    const { homedir } = await import('os')
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return { allowedTools: [], deniedTools: [] }
    try {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return {
        allowedTools: raw.allowedTools ?? [],
        deniedTools: raw.deniedTools ?? []
      }
    } catch {
      return { allowedTools: [], deniedTools: [] }
    }
  })

  ipcMain.handle('config:updatePermissions', async (_event, permissions: { allowedTools: string[]; deniedTools: string[] }) => {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs')
    const { homedir } = await import('os')
    const { dirname } = await import('path')
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    let existing: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      try { existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { /* ignore */ }
    }
    existing.allowedTools = permissions.allowedTools
    existing.deniedTools = permissions.deniedTools
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2), 'utf-8')
  })

  // Config Map
  ipcMain.handle('config:getConfigMap', (_event, projectPath: string) => {
    return readConfigMapData(projectPath)
  })

  // Organization Overview
  ipcMain.handle('config:getOrgOverview', (_event, projectPaths: string[]) => {
    return readAllWorkspacesSummary(projectPaths)
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return database.getSettings()
  })

  ipcMain.handle('settings:update', (_event, updates: Record<string, unknown>) => {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Invalid settings updates')
    }
    const validated: Partial<import('@shared/types').AppSettings> = {}
    if ('usePtyMode' in updates && typeof updates.usePtyMode === 'boolean') {
      validated.usePtyMode = updates.usePtyMode
    }
    if ('composerHeight' in updates && typeof updates.composerHeight === 'number') {
      validated.composerHeight = updates.composerHeight
    }
    if ('notifications' in updates && updates.notifications && typeof updates.notifications === 'object' && !Array.isArray(updates.notifications)) {
      const n = updates.notifications as Record<string, unknown>
      validated.notifications = {
        enabled: typeof n.enabled === 'boolean' ? n.enabled : true,
        taskComplete: typeof n.taskComplete === 'boolean' ? n.taskComplete : true,
        approvalRequired: typeof n.approvalRequired === 'boolean' ? n.approvalRequired : true,
        errors: typeof n.errors === 'boolean' ? n.errors : true
      }
    }
    return database.updateSettings(validated)
  })
}
