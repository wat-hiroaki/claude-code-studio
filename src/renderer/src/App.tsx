import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from './stores/useAppStore'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { TerminalView } from './components/TerminalView'
import { PtyTerminalView } from './components/PtyTerminalView'
import { ContextPane } from './components/ContextPane'
import { Dashboard } from './components/Dashboard'
import { BroadcastModal } from './components/BroadcastModal'
import { CreateAgentDialog } from './components/CreateAgentDialog'
import { ToastContainer, showToast } from './components/ToastContainer'
import { QuickSearch } from './components/QuickSearch'
import { WelcomeScreen } from './components/WelcomeScreen'
import { WorkspaceScanner } from './components/WorkspaceScanner'
import { cn } from './lib/utils'
import type { DiscoveredWorkspace } from '@shared/types'

function PaneGrid(): JSX.Element {
  const { selectedAgentId, paneLayout, paneAgentIds, setPaneAgent, agents, usePtyMode } = useAppStore()

  // For single pane, use selectedAgentId directly
  // For multi-pane, use paneAgentIds
  useEffect(() => {
    if (paneLayout === 1) return
    // Auto-assign selected agent to first empty pane
    if (selectedAgentId && !paneAgentIds.includes(selectedAgentId)) {
      const emptyIdx = paneAgentIds.findIndex((id) => !id)
      if (emptyIdx !== -1) {
        setPaneAgent(emptyIdx, selectedAgentId)
      }
    }
  }, [selectedAgentId, paneLayout, paneAgentIds, setPaneAgent])

  if (paneLayout === 1) {
    if (!selectedAgentId) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select an agent to start
        </div>
      )
    }
    return usePtyMode
      ? <PtyTerminalView agentId={selectedAgentId} />
      : <TerminalView agentId={selectedAgentId} />
  }

  const paneCount = paneLayout
  const gridClass = paneLayout === 2
    ? 'grid grid-cols-2 gap-px'
    : 'grid grid-cols-2 grid-rows-2 gap-px'

  return (
    <div className={cn('flex-1 overflow-hidden bg-border', gridClass)}>
      {Array.from({ length: paneCount }).map((_, i) => {
        const agentId = paneAgentIds[i]
        if (!agentId) {
          return (
            <div key={i} className="flex flex-col items-center justify-center bg-card text-muted-foreground gap-2">
              <p className="text-xs">Pane {i + 1}</p>
              <div className="flex flex-wrap gap-1 max-w-[200px] justify-center">
                {agents
                  .filter((a) => a.status !== 'archived')
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setPaneAgent(i, a.id)}
                      className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors"
                    >
                      {a.name}
                    </button>
                  ))}
              </div>
            </div>
          )
        }
        return usePtyMode ? (
          <PtyTerminalView
            key={`${i}-${agentId}`}
            agentId={agentId}
            compact={paneLayout === 4}
          />
        ) : (
          <TerminalView
            key={`${i}-${agentId}`}
            agentId={agentId}
            compact={paneLayout === 4}
            onClose={() => setPaneAgent(i, null)}
          />
        )
      })}
    </div>
  )
}

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
  const [showWorkspaceScanner, setShowWorkspaceScanner] = useState(false)
  const [prefillWorkspace, setPrefillWorkspace] = useState<DiscoveredWorkspace | null>(null)

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

    // Listen for OS theme changes (when theme is 'system')
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemTheme = (e: MediaQueryListEvent): void => {
      const currentTheme = useAppStore.getState().theme
      if (currentTheme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches)
        window.api?.setTitleBarTheme(e.matches)
      }
    }
    mql.addEventListener('change', handleSystemTheme)

    return () => {
      unsubOutput()
      unsubStatus()
      unsubNotification()
      mql.removeEventListener('change', handleSystemTheme)
    }
  }, [loadAgents, addMessage, updateAgentInList, setTeamStats])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        toggleDashboard()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        toggleBroadcast()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        toggleRightPane()
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        setShowCreateDialog(true)
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        if (agents.length === 0) return
        const currentIdx = agents.findIndex((a) => a.id === selectedAgentId)
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + agents.length) % agents.length
          : (currentIdx + 1) % agents.length
        setSelectedAgent(agents[nextIdx].id)
      }
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < agents.length) {
          setSelectedAgent(agents[idx].id)
        }
      }
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

      {showDashboard && <Dashboard onOpenScanner={() => setShowWorkspaceScanner(true)} />}

      <div className="flex flex-1 overflow-hidden">
        {agents.length === 0 ? (
          <WelcomeScreen onCreateAgent={() => setShowCreateDialog(true)} onOpenScanner={() => setShowWorkspaceScanner(true)} />
        ) : (
          <>
            <AgentList />
            <PaneGrid />
            {showRightPane && <ContextPane />}
          </>
        )}
      </div>

      <BroadcastModal />
      <ToastContainer />
      <QuickSearch />
      {showCreateDialog && (
        <CreateAgentDialog
          onClose={() => {
            setShowCreateDialog(false)
            setPrefillWorkspace(null)
          }}
          prefill={prefillWorkspace}
        />
      )}
      {showWorkspaceScanner && (
        <WorkspaceScanner
          onClose={() => setShowWorkspaceScanner(false)}
          onCreateAgent={(ws) => {
            setShowWorkspaceScanner(false)
            setPrefillWorkspace(ws)
            setShowCreateDialog(true)
          }}
        />
      )}
    </div>
  )
}
