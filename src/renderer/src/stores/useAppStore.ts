import { create } from 'zustand'
import type { Agent, Message, TeamStats, Task, PromptTemplate, AgentTeamsData } from '@shared/types'

interface AppState {
  // Agents
  agents: Agent[]
  selectedAgentId: string | null
  setAgents: (agents: Agent[]) => void
  setSelectedAgent: (id: string | null) => void
  updateAgentInList: (id: string, updates: Partial<Agent>) => void
  addAgent: (agent: Agent) => void
  removeAgent: (id: string) => void

  // Messages
  messages: Record<string, Message[]>
  setMessages: (agentId: string, messages: Message[]) => void
  addMessage: (agentId: string, message: Message) => void

  // Tasks
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void

  // Prompt Templates
  templates: PromptTemplate[]
  setTemplates: (templates: PromptTemplate[]) => void
  addTemplate: (template: PromptTemplate) => void
  updateTemplate: (id: string, updates: Partial<PromptTemplate>) => void
  removeTemplate: (id: string) => void

  // Team stats
  teamStats: TeamStats
  setTeamStats: (stats: TeamStats) => void

  // UI state
  showRightPane: boolean
  showBroadcast: boolean
  showDashboard: boolean
  dashboardActiveView: 'activityMap' | 'chainGraph' | 'scheduler' | 'configMap' | 'activityStream'
  toggleRightPane: () => void
  toggleBroadcast: () => void
  toggleDashboard: () => void
  setDashboardActiveView: (view: AppState['dashboardActiveView']) => void

  // Layout
  paneLayout: 1 | 2 | 4
  paneAgentIds: (string | null)[]
  setPaneLayout: (layout: 1 | 2 | 4) => void
  setPaneAgent: (paneIndex: number, agentId: string | null) => void
  swapPanes: (a: number, b: number) => void

  // Workspace
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (id: string | null) => void
  invalidProjects: { workspaceId: string; projectPath: string }[]
  setInvalidProjects: (projects: { workspaceId: string; projectPath: string }[]) => void

  // Terminal mode
  usePtyMode: boolean
  setUsePtyMode: (use: boolean) => void

  // Plan mode (per-agent)
  planModeAgents: Record<string, boolean>
  togglePlanMode: (agentId: string) => void
  isPlanMode: (agentId: string) => boolean

  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void

  // Chain flow visualization
  activeChainFlows: Array<{ id: string; fromAgentId: string; toAgentId: string; chainName: string; firedAt: number }>
  addChainFlow: (flow: { fromAgentId: string; toAgentId: string; chainName: string }) => void
  removeChainFlow: (id: string) => void

  // Memory monitoring
  agentMemory: Record<string, number>
  setAgentMemory: (agentId: string, memoryMB: number) => void
  setAgentMemoryBulk: (entries: Array<{ agentId: string; memoryMB: number }>) => void

  // Terminal
  terminalFontSize: number
  setTerminalFontSize: (size: number) => void

  // Agent Teams (Claude Code CLI integration)
  agentTeamsData: AgentTeamsData | null
  setAgentTeamsData: (data: AgentTeamsData) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Agents
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  setSelectedAgent: (id) => set((s) => {
    if (s.paneLayout > 1) {
      const newPaneAgentIds = [...s.paneAgentIds]
      if (id === null) {
        // Switching to dashboard: clear pane 0
        newPaneAgentIds[0] = null
        return { selectedAgentId: null, showDashboard: true, paneAgentIds: newPaneAgentIds }
      }
      // Selecting an agent: assign to first empty pane, or pane 0 if all full
      const emptyIdx = newPaneAgentIds.findIndex((pid) => !pid)
      const targetIdx = emptyIdx !== -1 ? emptyIdx : 0
      newPaneAgentIds[targetIdx] = id
      return { selectedAgentId: id, showDashboard: false, paneAgentIds: newPaneAgentIds }
    }
    return { selectedAgentId: id, showDashboard: id === null }
  }),
  updateAgentInList: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a))
    })),
  addAgent: (agent) =>
    set((state) => ({ agents: [agent, ...state.agents] })),
  removeAgent: (id) =>
    set((state) => ({ agents: state.agents.filter((a) => a.id !== id) })),

  // Messages
  messages: {},
  setMessages: (agentId, messages) =>
    set((state) => ({ messages: { ...state.messages, [agentId]: messages.slice(-200) } })),
  addMessage: (agentId, message) =>
    set((state) => {
      const existing = state.messages[agentId] || []
      const updated = [...existing, message]
      return { messages: { ...state.messages, [agentId]: updated.length > 200 ? updated.slice(-200) : updated } }
    }),

  // Tasks
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),
  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  // Prompt Templates
  templates: [],
  setTemplates: (templates) => set({ templates }),
  addTemplate: (template) => set((state) => ({ templates: [...state.templates, template] })),
  updateTemplate: (id, updates) =>
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),
  removeTemplate: (id) =>
    set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),

  // Team stats
  teamStats: { total: 0, active: 0, thinking: 0, awaiting: 0, error: 0, completedToday: 0 },
  setTeamStats: (stats) => set({ teamStats: stats }),

  // UI state
  showRightPane: false,
  showBroadcast: false,
  showDashboard: true,
  dashboardActiveView: 'activityMap',
  toggleRightPane: () => set((s) => ({ showRightPane: !s.showRightPane })),
  toggleBroadcast: () => set((s) => ({ showBroadcast: !s.showBroadcast })),
  setDashboardActiveView: (view) => set({ dashboardActiveView: view }),
  toggleDashboard: () => set((s) => {
    if (s.paneLayout > 1) {
      // Multi-pane: toggle dashboard in pane 0
      const currentPane0 = s.paneAgentIds[0]
      if (currentPane0) {
        // Pane 0 has an agent → clear it to show dashboard
        const newPaneAgentIds = [...s.paneAgentIds]
        newPaneAgentIds[0] = null
        return { selectedAgentId: null, showDashboard: true, paneAgentIds: newPaneAgentIds }
      }
      // Pane 0 is already dashboard → select first agent
      const firstAgent = s.agents.find(a => a.status !== 'archived')
      if (firstAgent) {
        const newPaneAgentIds = [...s.paneAgentIds]
        newPaneAgentIds[0] = firstAgent.id
        return { selectedAgentId: firstAgent.id, showDashboard: false, paneAgentIds: newPaneAgentIds }
      }
      return {}
    }
    if (s.selectedAgentId) {
      // Currently viewing an agent → switch to dashboard
      return { selectedAgentId: null, showDashboard: true }
    }
    // Already on dashboard → stay (or select first agent if available)
    const firstAgent = s.agents.find(a => a.status !== 'archived')
    return firstAgent
      ? { selectedAgentId: firstAgent.id, showDashboard: false }
      : {}
  }),

  // Layout
  paneLayout: 1,
  paneAgentIds: [null, null, null, null],
  setPaneLayout: (layout) => set({ paneLayout: layout }),
  setPaneAgent: (paneIndex, agentId) =>
    set((state) => {
      const ids = [...state.paneAgentIds]
      ids[paneIndex] = agentId
      return { paneAgentIds: ids }
    }),
  swapPanes: (a, b) =>
    set((state) => {
      const ids = [...state.paneAgentIds]
      const tmp = ids[a]
      ids[a] = ids[b]
      ids[b] = tmp
      return { paneAgentIds: ids }
    }),

  // Workspace
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  invalidProjects: [],
  setInvalidProjects: (projects) => set({ invalidProjects: projects }),

  // Terminal mode
  // Plan mode
  planModeAgents: {},
  togglePlanMode: (agentId) => set((state) => {
    const next = { ...state.planModeAgents }
    if (next[agentId]) {
      delete next[agentId]
    } else {
      next[agentId] = true
    }
    return { planModeAgents: next }
  }),
  isPlanMode: (agentId) => get().planModeAgents[agentId] === true,

  usePtyMode: (() => { try { return localStorage.getItem('usePtyMode') !== 'false' } catch { return true } })(),
  setUsePtyMode: (use) => {
    localStorage.setItem('usePtyMode', String(use))
    // Sync to main process
    window.api?.updateSettings({ usePtyMode: use })
    set({ usePtyMode: use })
  },

  // Chain flow visualization
  activeChainFlows: [],
  addChainFlow: (flow) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((state) => ({
      activeChainFlows: [...state.activeChainFlows, { ...flow, id, firedAt: Date.now() }]
    }))
    // Auto-remove after 4 seconds
    setTimeout(() => {
      set((state) => ({
        activeChainFlows: state.activeChainFlows.filter(f => f.id !== id)
      }))
    }, 4000)
  },
  removeChainFlow: (id) => set((state) => ({
    activeChainFlows: state.activeChainFlows.filter(f => f.id !== id)
  })),

  // Memory monitoring
  agentMemory: {},
  setAgentMemory: (agentId, memoryMB) => set((state) => ({
    agentMemory: { ...state.agentMemory, [agentId]: memoryMB }
  })),
  setAgentMemoryBulk: (entries) => set((state) => {
    const next = { ...state.agentMemory }
    for (const { agentId, memoryMB } of entries) next[agentId] = memoryMB
    return { agentMemory: next }
  }),

  // Terminal
  terminalFontSize: (() => { try { return parseInt(localStorage.getItem('terminalFontSize') ?? '13') || 13 } catch { return 13 } })(),
  setTerminalFontSize: (size) => {
    localStorage.setItem('terminalFontSize', String(size))
    set({ terminalFontSize: size })
  },

  // Agent Teams
  agentTeamsData: null,
  setAgentTeamsData: (data) => set({ agentTeamsData: data }),

  // Theme
  theme: (() => { try { return (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'dark' } catch { return 'dark' as const } })(),
  setTheme: (theme) => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', theme)
    window.api?.setTitleBarTheme(isDark)
    set({ theme })
  }
}))
