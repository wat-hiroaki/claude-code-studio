import { create } from 'zustand'
import type { Agent, Message, TeamStats, Task, PromptTemplate } from '@shared/types'

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
  dashboardActiveView: 'orgChart' | 'skillMap' | 'kanban' | 'activityMap' | 'activityStream'
  toggleRightPane: () => void
  toggleBroadcast: () => void
  toggleDashboard: () => void
  setDashboardActiveView: (view: 'orgChart' | 'skillMap' | 'kanban' | 'activityMap' | 'activityStream') => void

  // Layout
  paneLayout: 1 | 2 | 4
  paneAgentIds: (string | null)[]
  setPaneLayout: (layout: 1 | 2 | 4) => void
  setPaneAgent: (paneIndex: number, agentId: string | null) => void

  // Workspace
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (id: string | null) => void
  invalidWorkspaceIds: string[]
  setInvalidWorkspaceIds: (ids: string[]) => void

  // Terminal mode
  usePtyMode: boolean
  setUsePtyMode: (use: boolean) => void

  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void

  // Terminal
  terminalFontSize: number
  setTerminalFontSize: (size: number) => void
}

export const useAppStore = create<AppState>((set) => ({
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
    set((state) => ({ messages: { ...state.messages, [agentId]: messages } })),
  addMessage: (agentId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [agentId]: [...(state.messages[agentId] || []), message]
      }
    })),

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
  dashboardActiveView: 'orgChart',
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

  // Workspace
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  invalidWorkspaceIds: [],
  setInvalidWorkspaceIds: (ids) => set({ invalidWorkspaceIds: ids }),

  // Terminal mode
  usePtyMode: localStorage.getItem('usePtyMode') !== 'false',
  setUsePtyMode: (use) => {
    localStorage.setItem('usePtyMode', String(use))
    // Sync to main process
    window.api?.updateSettings({ usePtyMode: use })
    set({ usePtyMode: use })
  },

  // Terminal
  terminalFontSize: parseInt(localStorage.getItem('terminalFontSize') ?? '13'),
  setTerminalFontSize: (size) => {
    localStorage.setItem('terminalFontSize', String(size))
    set({ terminalFontSize: size })
  },

  // Theme
  theme: (localStorage.getItem('theme') as 'dark' | 'light' | 'system') || 'dark',
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
