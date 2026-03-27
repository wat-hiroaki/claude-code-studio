import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Database } from '@main/database'
import type { SessionManager } from '@main/sessionManager'
import type { PtySessionManager } from '@main/ptySessionManager'
import type { SshSessionManager } from '@main/sshSessionManager'
import type { CreateAgentParams } from '@shared/types'

interface AgentHandlerDeps {
  database: Database
  sessionManager: SessionManager
  ptySessionManager: PtySessionManager
  sshSessionManager: SshSessionManager
  getMainWindow: () => BrowserWindow | null
  isAgentSsh: (agentId: string) => boolean
  getAgentWorkspace: (agentId: string) => import('@shared/types').Workspace | null
  handleStatusChangeWithNotification: (agentId: string, status: string) => void
  ptyParseTimers: Map<string, ReturnType<typeof setTimeout>>
  ptyParseBuffers: Map<string, string>
}

export function registerAgentHandlers(deps: AgentHandlerDeps): void {
  const {
    database, sessionManager, ptySessionManager, sshSessionManager,
    getMainWindow, isAgentSsh, getAgentWorkspace,
    ptyParseTimers, ptyParseBuffers
  } = deps

  ipcMain.handle('agent:create', async (_event, params: CreateAgentParams) => {
    if (!params.name?.trim() || !params.projectName?.trim()) {
      throw new Error('name and projectName are required')
    }
    const agent = database.createAgent(params)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      database.updateAgent(agent.id, { status: 'idle' })
    } else if (isAgentSsh(agent.id)) {
      database.updateAgent(agent.id, { status: 'idle' })
    } else {
      await sessionManager.startSession(agent)
    }
    return database.getAgent(agent.id)
  })

  ipcMain.handle('agent:list', () => {
    return database.getAgents()
  })

  ipcMain.handle('agent:get', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    return database.getAgent(id)
  })

  ipcMain.handle('agent:update', (_event, id: string, updates: Record<string, unknown>) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Invalid updates: must be an object')
    }
    const ALLOWED_AGENT_KEYS = new Set([
      'name', 'icon', 'roleLabel', 'workspaceId', 'projectPath', 'projectName',
      'sessionNumber', 'status', 'currentTask', 'systemPrompt', 'claudeSessionId',
      'isPinned', 'skills', 'teamId', 'reportTo', 'parentAgentId', 'isTemporary'
    ])
    const sanitized: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) {
      if (ALLOWED_AGENT_KEYS.has(key)) {
        sanitized[key] = updates[key]
      }
    }
    return database.updateAgent(id, sanitized)
  })

  ipcMain.handle('agent:archive', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(id)) {
        sshSessionManager.stopSession(id)
      } else {
        ptySessionManager.stopSession(id)
      }
    } else {
      await sessionManager.stopSession(id)
    }
    const timer = ptyParseTimers.get(id)
    if (timer) { clearTimeout(timer); ptyParseTimers.delete(id) }
    ptyParseBuffers.delete(id)
    database.updateAgent(id, { status: 'archived' })
    getMainWindow()?.webContents.send('agent:status-change', id, 'archived')
  })

  ipcMain.handle('agent:unarchive', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    database.updateAgent(id, { status: 'idle' })
    getMainWindow()?.webContents.send('agent:status-change', id, 'idle')
  })

  ipcMain.handle('agent:delete', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(id)) {
        sshSessionManager.stopSession(id)
      } else {
        ptySessionManager.stopSession(id)
      }
    } else {
      await sessionManager.stopSession(id)
    }
    const timer = ptyParseTimers.get(id)
    if (timer) { clearTimeout(timer); ptyParseTimers.delete(id) }
    ptyParseBuffers.delete(id)
    database.deleteAgent(id)
    getMainWindow()?.webContents.send('agent:deleted', id)
  })

  ipcMain.handle('agent:restart', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(id)
    if (agent) {
      const { usePtyMode } = database.getSettings()
      if (usePtyMode) {
        if (sshSessionManager.hasSession(id)) {
          sshSessionManager.stopSession(id)
        } else if (ptySessionManager.hasSession(id)) {
          ptySessionManager.stopSession(id)
        }
        if (isAgentSsh(id)) {
          const workspace = getAgentWorkspace(id)
          if (workspace) {
            await sshSessionManager.startSession(agent, workspace)
          }
        } else {
          await ptySessionManager.startSession(agent)
        }
      } else {
        await sessionManager.stopSession(id)
        await sessionManager.startSession(agent)
      }
    }
  })

  ipcMain.handle('agent:interrupt', async (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid agent ID')
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(id)) {
        sshSessionManager.interruptSession(id)
      } else {
        ptySessionManager.interruptSession(id)
      }
    } else {
      await sessionManager.interruptSession(id)
    }
  })

  // Messaging
  ipcMain.handle('message:send', async (_event, agentId: string, content: string) => {
    if (typeof agentId !== 'string' || typeof content !== 'string') {
      throw new Error('Invalid message parameters')
    }
    database.addMessage(agentId, 'manager', 'text', content)
    const { usePtyMode } = database.getSettings()
    if (usePtyMode) {
      if (sshSessionManager.hasSession(agentId)) {
        sshSessionManager.writeInput(agentId, content + '\n')
      } else {
        ptySessionManager.writeInput(agentId, content + '\n')
      }
    } else {
      await sessionManager.sendInput(agentId, content)
    }
  })

  ipcMain.handle('message:list', (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    return database.getMessages(agentId)
  })

  // Broadcast
  ipcMain.handle('broadcast:send', async (_event, agentIds: string[], message: string) => {
    if (!Array.isArray(agentIds) || typeof message !== 'string') {
      throw new Error('Invalid broadcast parameters')
    }
    const broadcastId = database.createBroadcast(message, agentIds)
    const { usePtyMode } = database.getSettings()
    await Promise.all(agentIds.map(async (agentId) => {
      database.addMessage(agentId, 'manager', 'text', message)
      if (usePtyMode) {
        if (sshSessionManager.hasSession(agentId)) {
          sshSessionManager.writeInput(agentId, message + '\n')
        } else {
          ptySessionManager.writeInput(agentId, message + '\n')
        }
      } else {
        await sessionManager.sendInput(agentId, message)
      }
    }))
    database.updateBroadcast(broadcastId, { status: 'sent' })
    return broadcastId
  })

  // Task chains
  ipcMain.handle('chain:create', (_event, chain: Record<string, unknown>) => {
    if (
      typeof chain?.name !== 'string' || !chain.name.trim() ||
      typeof chain?.triggerAgentId !== 'string' ||
      typeof chain?.targetAgentId !== 'string' ||
      typeof chain?.messageTemplate !== 'string'
    ) {
      throw new Error('Invalid chain parameters: name, triggerAgentId, targetAgentId, and messageTemplate are required')
    }
    const tc = chain.triggerCondition
    if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
      throw new Error('Invalid chain parameters: triggerCondition must be an object with a type field')
    }
    const tcObj = tc as Record<string, unknown>
    const validConditionTypes = ['complete', 'keyword', 'no_error', 'scheduled']
    if (typeof tcObj.type !== 'string' || !validConditionTypes.includes(tcObj.type)) {
      throw new Error('Invalid chain parameters: triggerCondition.type must be one of: complete, keyword, no_error, scheduled')
    }
    const triggerCondition: import('@shared/types').TaskChain['triggerCondition'] = {
      type: tcObj.type as 'complete' | 'keyword' | 'no_error' | 'scheduled',
      ...(typeof tcObj.keyword === 'string' ? { keyword: tcObj.keyword } : {}),
      ...(typeof tcObj.cronExpression === 'string' ? { cronExpression: tcObj.cronExpression } : {}),
      ...(typeof tcObj.intervalMinutes === 'number' ? { intervalMinutes: tcObj.intervalMinutes } : {})
    }
    const validatedChain: Omit<import('@shared/types').TaskChain, 'id' | 'createdAt'> = {
      name: chain.name,
      triggerAgentId: chain.triggerAgentId,
      targetAgentId: chain.targetAgentId,
      messageTemplate: chain.messageTemplate,
      triggerCondition,
      onError: chain.onError === 'skip' || chain.onError === 'notify_only' ? chain.onError : 'stop',
      isActive: typeof chain.isActive === 'boolean' ? chain.isActive : true
    }
    return deps.database.createChain(validatedChain)
  })

  ipcMain.handle('chain:list', () => {
    return database.getChains()
  })

  ipcMain.handle('chain:update', (_event, id: string, updates) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    return database.updateChain(id, updates)
  })

  ipcMain.handle('chain:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid chain ID')
    return database.deleteChain(id)
  })

  // Teams
  ipcMain.handle('team:create', (_event, name: string, color: string) => {
    if (typeof name !== 'string' || !name.trim()) throw new Error('Team name is required')
    return database.createTeam(name.trim(), color || '#6366f1')
  })

  ipcMain.handle('team:list', () => {
    return database.getTeams()
  })

  ipcMain.handle('team:update', (_event, id: string, updates: Record<string, unknown>) => {
    if (typeof id !== 'string') throw new Error('Invalid team ID')
    return database.updateTeam(id, updates)
  })

  ipcMain.handle('team:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid team ID')
    return database.deleteTeam(id)
  })

  // Tasks
  ipcMain.handle('task:create', (_event, title: string, description?: string, status?: import('@shared/types').TaskStatus, agentId?: string) => {
    if (typeof title !== 'string' || !title.trim()) throw new Error('Task title is required')
    return database.createTask(title.trim(), description, status, agentId)
  })

  ipcMain.handle('task:list', () => {
    return database.getTasks()
  })

  ipcMain.handle('task:update', (_event, id: string, updates: Partial<import('@shared/types').Task>) => {
    if (typeof id !== 'string') throw new Error('Invalid task ID')
    return database.updateTask(id, updates)
  })

  ipcMain.handle('task:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid task ID')
    return database.deleteTask(id)
  })

  // Prompt Templates
  ipcMain.handle('template:create', (_event, template: { label: string; value: string; category: string }) => {
    if (!template?.label?.trim()) throw new Error('Template label is required')
    return database.createTemplate({ label: template.label.trim(), value: template.value, category: template.category })
  })

  ipcMain.handle('template:list', () => {
    return database.getTemplates()
  })

  ipcMain.handle('template:update', (_event, id: string, updates: Partial<import('@shared/types').PromptTemplate>) => {
    if (typeof id !== 'string') throw new Error('Invalid template ID')
    return database.updateTemplate(id, updates)
  })

  ipcMain.handle('template:delete', (_event, id: string) => {
    if (typeof id !== 'string') throw new Error('Invalid template ID')
    return database.deleteTemplate(id)
  })

  // Team stats
  ipcMain.handle('team:stats', () => {
    return database.getTeamStats()
  })

  // Chain execution logs
  ipcMain.handle('chain:executionLogs', (_event, limit?: number) => {
    return database.getChainExecutionLogs(limit)
  })

  ipcMain.handle('chain:scheduled', () => {
    return database.getScheduledChains()
  })

  // Agent Profile
  ipcMain.handle('agent:profile', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    const { readAgentProfile } = await import('@main/config')
    return readAgentProfile(agent.projectPath)
  })

  ipcMain.handle('agent:readFile', async (_event, filePath: string) => {
    if (typeof filePath !== 'string') throw new Error('Invalid file path')
    if (!/\.(md|json|yml|yaml|txt)$/i.test(filePath)) {
      throw new Error('Only text/config files can be read')
    }
    const { readFileContent } = await import('@main/config')
    return readFileContent(filePath)
  })

  // Agent templates (export/import)
  ipcMain.handle('agent:exportTemplate', async (_event, agentId: string) => {
    if (typeof agentId !== 'string') throw new Error('Invalid agent ID')
    const agent = database.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')
    const { app, dialog } = await import('electron')
    const template: import('@shared/types').AgentTemplate = {
      name: agent.name,
      roleLabel: agent.roleLabel,
      systemPrompt: agent.systemPrompt,
      skills: agent.skills,
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion()
    }
    const mainWindow = getMainWindow()
    if (!mainWindow) return ''
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${agent.name.replace(/\s+/g, '-').toLowerCase()}-template.json`,
      filters: [{ name: 'Agent Template', extensions: ['json'] }]
    })
    if (canceled || !filePath) return ''
    const { writeFileSync } = await import('fs')
    writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8')
    return filePath
  })

  ipcMain.handle('agent:importTemplate', async () => {
    const { dialog } = await import('electron')
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Agent Template', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    const { readFileSync } = await import('fs')
    try {
      const content = readFileSync(filePaths[0], 'utf-8')
      const template = JSON.parse(content) as import('@shared/types').AgentTemplate
      if (!template.name || !template.exportedAt) throw new Error('Invalid template format')
      return template
    } catch {
      throw new Error('Failed to parse agent template file')
    }
  })

  // Agent Definitions (saved profiles)
  ipcMain.handle('agentDef:list', async () => {
    return database.getAgentTemplates()
  })

  ipcMain.handle('agentDef:create', async (_event, params) => {
    return database.createAgentTemplate(params)
  })

  ipcMain.handle('agentDef:delete', async (_event, id: string) => {
    database.deleteAgentTemplate(id)
  })
}
