import { create } from 'zustand'
import type { Agent, Message, TeamStats, Task, PromptTemplate, AgentTeamsData } from '@shared/types'
import type { LayoutNode, DropPosition } from '@appTypes/layout'
import {
  DEFAULT_LAYOUT,
  splitLeaf,
  removeLeaf as removeLeafFromTree,
  setLeafAgent as setLeafAgentInTree,
  getAllAgentIds,
  getAllLeaves,
  findNode,
  dropToSplit
} from '@appTypes/layout'

interface AppState {
  // Agents
  agents: Agent[]
  selectedAgentId: string | null
  setAgents: (agents: Agent[]) => void
  setSelectedAgent: (id: string | null, assignToPane?: boolean) => void
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
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  showRightPane: boolean
  showBroadcast: boolean
  showDashboard: boolean
  dashboardActiveView: 'activityMap' | 'chainGraph' | 'scheduler' | 'configMap' | 'activityStream'
  toggleRightPane: () => void
  toggleBroadcast: () => void
  toggleDashboard: () => void
  setDashboardActiveView: (view: AppState['dashboardActiveView']) => void

  // Layout (tree-based split layout)
  layoutTree: LayoutNode
  setLayoutTree: (tree: LayoutNode) => void
  splitPane: (leafId: string, direction: 'horizontal' | 'vertical', agentId: string | null, position: 'before' | 'after') => void
  setLeafAgent: (leafId: string, agentId: string | null) => void
  removeLeaf: (leafId: string) => void
  moveAgent: (fromLeafId: string, toLeafId: string, position: DropPosition) => void
  resetLayout: () => void

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
  setSelectedAgent: (id, assignToPane = true) => set((s) => {
    const leaves = getAllLeaves(s.layoutTree)
    const hasMultiplePanes = leaves.length > 1
    const assignedIds = getAllAgentIds(s.layoutTree)

    if (hasMultiplePanes) {
      if (id === null) {
        return { selectedAgentId: null, showDashboard: true }
      }
      // Only assign to a pane if explicitly requested (sidebar click, not hover)
      if (assignToPane && !assignedIds.includes(id)) {
        // Find first empty leaf
        const emptyLeaf = leaves.find(l => !l.agentId)
        if (emptyLeaf) {
          return {
            selectedAgentId: id,
            showDashboard: false,
            layoutTree: setLeafAgentInTree(s.layoutTree, emptyLeaf.id, id)
          }
        }
        // No empty leaf — replace the first leaf
        return {
          selectedAgentId: id,
          showDashboard: false,
          layoutTree: setLeafAgentInTree(s.layoutTree, leaves[0].id, id)
        }
      }
      return { selectedAgentId: id, showDashboard: false }
    }
    // Single pane — assign to root leaf if clicking from sidebar
    if (id && assignToPane && leaves.length === 1 && leaves[0].agentId !== id) {
      return {
        selectedAgentId: id,
        showDashboard: false,
        layoutTree: setLeafAgentInTree(s.layoutTree, leaves[0].id, id)
      }
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
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  showRightPane: false,
  showBroadcast: false,
  showDashboard: true,
  dashboardActiveView: 'activityMap',
  toggleRightPane: () => set((s) => ({ showRightPane: !s.showRightPane })),
  toggleBroadcast: () => set((s) => ({ showBroadcast: !s.showBroadcast })),
  setDashboardActiveView: (view) => set({ dashboardActiveView: view }),
  toggleDashboard: () => set((s) => {
    if (s.selectedAgentId) {
      return { selectedAgentId: null, showDashboard: true }
    }
    const firstAgent = s.agents.find(a => a.status !== 'archived')
    return firstAgent
      ? { selectedAgentId: firstAgent.id, showDashboard: false }
      : {}
  }),

  // Layout (tree-based split layout)
  layoutTree: (() => {
    try {
      const saved = localStorage.getItem('layoutTree')
      if (saved) return JSON.parse(saved) as LayoutNode
    } catch { /* ignore */ }
    return { ...DEFAULT_LAYOUT }
  })(),
  setLayoutTree: (tree) => {
    localStorage.setItem('layoutTree', JSON.stringify(tree))
    set({ layoutTree: tree })
  },
  splitPane: (leafId, direction, agentId, position) => set((s) => {
    const newTree = splitLeaf(s.layoutTree, leafId, direction, agentId || null, position)
    localStorage.setItem('layoutTree', JSON.stringify(newTree))
    return {
      layoutTree: newTree,
      ...(agentId ? { selectedAgentId: agentId, showDashboard: false } : {})
    }
  }),
  setLeafAgent: (leafId, agentId) => set((s) => {
    const newTree = setLeafAgentInTree(s.layoutTree, leafId, agentId)
    localStorage.setItem('layoutTree', JSON.stringify(newTree))
    return {
      layoutTree: newTree,
      ...(agentId ? { selectedAgentId: agentId, showDashboard: false } : {})
    }
  }),
  removeLeaf: (leafId) => set((s) => {
    const newTree = removeLeafFromTree(s.layoutTree, leafId)
    localStorage.setItem('layoutTree', JSON.stringify(newTree))
    // Select another agent if available
    const remaining = getAllAgentIds(newTree)
    return {
      layoutTree: newTree,
      selectedAgentId: remaining.length > 0 ? remaining[0] : null,
      showDashboard: remaining.length === 0
    }
  }),
  moveAgent: (fromLeafId, toLeafId, position) => set((s) => {
    const fromNode = findNode(s.layoutTree, fromLeafId)
    if (!fromNode || fromNode.type !== 'leaf' || !fromNode.agentId) return {}

    const agentId = fromNode.agentId
    const splitInfo = dropToSplit(position)

    if (splitInfo) {
      // Remove from source first
      let tree = removeLeafFromTree(s.layoutTree, fromLeafId)
      // Then split the target
      tree = splitLeaf(tree, toLeafId, splitInfo.direction, agentId, splitInfo.position)
      localStorage.setItem('layoutTree', JSON.stringify(tree))
      return { layoutTree: tree, selectedAgentId: agentId }
    } else {
      // Center drop — swap agents
      const toNode = findNode(s.layoutTree, toLeafId)
      if (!toNode || toNode.type !== 'leaf') return {}
      let tree = setLeafAgentInTree(s.layoutTree, fromLeafId, toNode.agentId)
      tree = setLeafAgentInTree(tree, toLeafId, agentId)
      localStorage.setItem('layoutTree', JSON.stringify(tree))
      return { layoutTree: tree, selectedAgentId: agentId }
    }
  }),
  resetLayout: () => {
    const tree = { ...DEFAULT_LAYOUT }
    localStorage.setItem('layoutTree', JSON.stringify(tree))
    set({ layoutTree: tree, selectedAgentId: null, showDashboard: true })
  },

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
