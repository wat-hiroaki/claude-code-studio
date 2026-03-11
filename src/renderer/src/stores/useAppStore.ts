import { create } from 'zustand'
import type { Agent, Message, TeamStats } from '@shared/types'

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

  // Team stats
  teamStats: TeamStats
  setTeamStats: (stats: TeamStats) => void

  // UI state
  showDashboard: boolean
  showRightPane: boolean
  showBroadcast: boolean
  toggleDashboard: () => void
  toggleRightPane: () => void
  toggleBroadcast: () => void

  // Layout
  paneLayout: 1 | 2 | 4
  paneAgentIds: (string | null)[]
  setPaneLayout: (layout: 1 | 2 | 4) => void
  setPaneAgent: (paneIndex: number, agentId: string | null) => void

  // Theme
  theme: 'dark' | 'light' | 'system'
  setTheme: (theme: 'dark' | 'light' | 'system') => void
}

export const useAppStore = create<AppState>((set) => ({
  // Agents
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  setSelectedAgent: (id) => set({ selectedAgentId: id }),
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

  // Team stats
  teamStats: { active: 0, awaiting: 0, error: 0, completedToday: 0 },
  setTeamStats: (stats) => set({ teamStats: stats }),

  // UI state
  showDashboard: false,
  showRightPane: false,
  showBroadcast: false,
  toggleDashboard: () => set((s) => ({ showDashboard: !s.showDashboard })),
  toggleRightPane: () => set((s) => ({ showRightPane: !s.showRightPane })),
  toggleBroadcast: () => set((s) => ({ showBroadcast: !s.showBroadcast })),

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
