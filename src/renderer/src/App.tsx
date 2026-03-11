import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from './stores/useAppStore'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { ChatArea } from './components/ChatArea'
import { ContextPane } from './components/ContextPane'
import { Dashboard } from './components/Dashboard'
import { BroadcastModal } from './components/BroadcastModal'
import { CreateAgentDialog } from './components/CreateAgentDialog'
import { ToastContainer, showToast } from './components/ToastContainer'

export function App(): JSX.Element {
  const {
    agents,
    selectedAgentId,
    setAgents,
    setSelectedAgent,
    updateAgentInList,
    addMessage,
    setTeamStats,
    showDashboard,
    showRightPane,
    toggleDashboard,
    toggleRightPane,
    toggleBroadcast
  } = useAppStore()

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const loadAgents = useCallback(async () => {
    const agentList = await window.api.getAgents()
    setAgents(agentList)
    const stats = await window.api.getTeamStats()
    setTeamStats(stats)
  }, [setAgents, setTeamStats])

  useEffect(() => {
    loadAgents()

    const unsubOutput = window.api.onAgentOutput((agentId, message) => {
      addMessage(agentId, {
        id: Date.now(),
        agentId,
        role: message.role,
        contentType: message.contentType,
        content: message.content,
        metadata: message.metadata ?? null,
        createdAt: new Date().toISOString()
      })
    })

    const unsubStatus = window.api.onAgentStatusChange((agentId, status) => {
      updateAgentInList(agentId, { status })
      window.api.getTeamStats().then(setTeamStats)
    })

    const unsubNotification = window.api.onNotification((title, body) => {
      showToast(title, body, title.includes('Error') ? 'error' : 'warning')
    })

    return () => {
      unsubOutput()
      unsubStatus()
      unsubNotification()
    }
  }, [loadAgents, addMessage, updateAgentInList, setTeamStats])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Ctrl+D — Toggle dashboard
      if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        toggleDashboard()
      }
      // Ctrl+Shift+B — Broadcast
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        toggleBroadcast()
      }
      // Ctrl+Shift+P — Right pane
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        toggleRightPane()
      }
      // Ctrl+N — New agent
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        setShowCreateDialog(true)
      }
      // Ctrl+Tab / Ctrl+Shift+Tab — Navigate agents
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (agents.length === 0) return
        const currentIdx = agents.findIndex((a) => a.id === selectedAgentId)
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + agents.length) % agents.length
          : (currentIdx + 1) % agents.length
        setSelectedAgent(agents[nextIdx].id)
      }
      // Ctrl+1-9 — Jump to agent by index
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < agents.length) {
          setSelectedAgent(agents[idx].id)
        }
      }
      // Ctrl+W — Archive current agent
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (selectedAgentId) {
          window.api.archiveAgent(selectedAgentId)
          const remaining = agents.filter((a) => a.id !== selectedAgentId)
          setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
          loadAgents()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [agents, selectedAgentId, setSelectedAgent, toggleDashboard, toggleBroadcast, toggleRightPane, loadAgents])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />

      {showDashboard && <Dashboard />}

      <div className="flex flex-1 overflow-hidden">
        <AgentList />

        <ChatArea />

        {showRightPane && <ContextPane />}
      </div>

      <BroadcastModal />
      <ToastContainer />
      {showCreateDialog && <CreateAgentDialog onClose={() => setShowCreateDialog(false)} />}
    </div>
  )
}
