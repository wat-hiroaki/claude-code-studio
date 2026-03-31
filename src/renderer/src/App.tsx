import { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Panel, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useAppStore } from '@stores/useAppStore'
import { TitleBar } from '@components/TitleBar'
import { AgentList } from '@components/agentList'
import { ContextPane } from '@components/ContextPane'
import { LayoutTree } from '@components/LayoutTree'
import { DndProvider } from '@components/DndProvider'
import { CreateAgentDialog } from '@components/CreateAgentDialog'
import { ToastContainer, showToast } from '@components/ToastContainer'
import { QuickSearch } from '@components/QuickSearch'
import { ShortcutHelp } from '@components/ShortcutHelp'
import { WelcomeScreen } from '@components/WelcomeScreen'
import { WorkspaceScanner } from '@components/WorkspaceScanner'
import { ErrorBoundary } from '@components/ErrorBoundary'
import { ResizeHandle } from '@components/ResizeHandle'
import { UpdateBanner } from '@components/UpdateBanner'

import type { DiscoveredWorkspace } from '@shared/types'


interface MainLayoutProps {
  showRightPane: boolean
  onOpenScanner?: () => void
  sidebarRef: ReturnType<typeof usePanelRef>
}

function MainLayout({ showRightPane, onOpenScanner, sidebarRef }: MainLayoutProps): JSX.Element {
  const { setSidebarCollapsed } = useAppStore()
  const panelIds = showRightPane
    ? ['sidebar', 'terminal', 'context']
    : ['sidebar', 'terminal']

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `main-layout-${showRightPane ? '3' : '2'}`,
    panelIds,
  })

  const toggleSidebar = useCallback(() => {
    const panel = sidebarRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [sidebarRef])

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel
        id="sidebar"
        defaultSize="20%"
        minSize={180}
        maxSize={350}
        collapsible
        collapsedSize={0}
        panelRef={sidebarRef}
        onResize={(size) => {
          setSidebarCollapsed(size === 0)
        }}
      >
        <ErrorBoundary fallbackMessage="Sidebar failed to render">
          <AgentList onCollapseSidebar={toggleSidebar} />
        </ErrorBoundary>
      </Panel>
      <ResizeHandle />
      <Panel id="terminal" minSize={300}>
        <ErrorBoundary fallbackMessage="Terminal failed to render">
          <LayoutTree onOpenScanner={onOpenScanner} />
        </ErrorBoundary>
      </Panel>
      {showRightPane && (
        <>
          <ResizeHandle />
          <Panel id="context" defaultSize="25%" minSize={200} maxSize={500}>
            <ErrorBoundary fallbackMessage="Context pane failed to render">
              <ContextPane />
            </ErrorBoundary>
          </Panel>
        </>
      )}
    </Group>
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
    showRightPane,
    toggleRightPane
  } = useAppStore()

  const { t } = useTranslation()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showWorkspaceScanner, setShowWorkspaceScanner] = useState(false)
  const [prefillWorkspace, setPrefillWorkspace] = useState<DiscoveredWorkspace | null>(null)
  const sidebarRef = usePanelRef()

  // Listen for QuickSearch new-agent command
  useEffect(() => {
    const handler = (): void => setShowCreateDialog(true)
    document.addEventListener('app:new-agent', handler)
    return () => document.removeEventListener('app:new-agent', handler)
  }, [])

  const loadAgents = useCallback(async () => {
    const agentList = await window.api.getAgents()
    setAgents(agentList)
    const stats = await window.api.getTeamStats()
    setTeamStats(stats)
    
    const { usePtyMode, setTasks, setTemplates } = useAppStore.getState()
    const taskList = await window.api.getTasks()
    setTasks(taskList)
    const templateList = await window.api.getTemplates()
    setTemplates(templateList)
    
    // Sync PTY mode setting to main process
    window.api.updateSettings({ usePtyMode })
  }, [setAgents, setTeamStats])

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    loadAgents()

    const unsubOutput = window.api.onAgentOutput((agentId, message) => {
      if (!isMountedRef.current) return
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
      if (!isMountedRef.current) return
      updateAgentInList(agentId, { status })
      window.api.getTeamStats().then(setTeamStats)
    })

    const unsubDeleted = window.api.onAgentDeleted((agentId) => {
      if (!isMountedRef.current) return
      const { removeAgent, selectedAgentId, agents } = useAppStore.getState()
      removeAgent(agentId)
      if (selectedAgentId === agentId) {
        const remaining = agents.filter((a) => a.id !== agentId)
        useAppStore.getState().setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
      }
      window.api.getTeamStats().then(setTeamStats)
    })

    const unsubNotification = window.api.onNotification((title, body) => {
      if (!isMountedRef.current) return
      showToast(title, body, title.includes('Error') ? 'error' : title.includes('Memory') ? 'warning' : 'warning')
    })

    const unsubMemory = window.api.onMemoryUpdate((data) => {
      if (!isMountedRef.current) return
      useAppStore.getState().setAgentMemoryBulk(data)
    })

    // Agent Teams: subscribe to updates and fetch initial data
    window.api.getAgentTeamsData().then((data) => {
      if (!isMountedRef.current) return
      useAppStore.getState().setAgentTeamsData(data)
    }).catch(() => {})
    const unsubAgentTeams = window.api.onAgentTeamsUpdate((data) => {
      if (!isMountedRef.current) return
      useAppStore.getState().setAgentTeamsData(data)
    })

    const unsubChain = window.api.onChainEvent((event) => {
      if (!isMountedRef.current) return
      if (event.status === 'fired') {
        useAppStore.getState().addChainFlow({
          fromAgentId: event.fromAgentId,
          toAgentId: event.toAgentId,
          chainName: event.chainName
        })
      }
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

    // Periodic stats refresh (every 30s)
    const statsInterval = setInterval(() => {
      window.api.getTeamStats().then(setTeamStats)
    }, 30000)

    return () => {
      isMountedRef.current = false
      unsubOutput()
      unsubStatus()
      unsubDeleted()
      unsubNotification()
      unsubMemory()
      unsubAgentTeams()
      unsubChain()
      mql.removeEventListener('change', handleSystemTheme)
      clearInterval(statsInterval)
    }
  }, [loadAgents, addMessage, updateAgentInList, setTeamStats])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        const panel = sidebarRef.current
        if (panel) {
          if (panel.isCollapsed()) panel.expand()
          else panel.collapse()
        }
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        setSelectedAgent(null)
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
      // Zoom terminal font: Ctrl+= / Ctrl+-
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const { terminalFontSize, setTerminalFontSize } = useAppStore.getState()
        setTerminalFontSize(Math.min(terminalFontSize + 1, 24))
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault()
        const { terminalFontSize, setTerminalFontSize } = useAppStore.getState()
        setTerminalFontSize(Math.max(terminalFontSize - 1, 9))
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
        e.preventDefault()
        // Focus the composer input
        const composer = document.querySelector('[data-composer-input]') as HTMLTextAreaElement | null
        composer?.focus()
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (selectedAgentId) {
          const agentToArchive = agents.find((a) => a.id === selectedAgentId)
          if (agentToArchive) {
            window.api.confirm(t('agent.confirmArchive', 'Archive agent "{{name}}"?', { name: agentToArchive.name })).then((confirmed) => {
              if (!confirmed) return
              window.api.archiveAgent(selectedAgentId!)
              const remaining = agents.filter((a) => a.id !== selectedAgentId && a.status !== 'archived')
              setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
              loadAgents()
            })
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [agents, selectedAgentId, setSelectedAgent, toggleRightPane, loadAgents])

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
      <UpdateBanner />

      <div className="flex flex-1 overflow-hidden">
        {agents.length === 0 ? (
          <WelcomeScreen onCreateAgent={() => setShowCreateDialog(true)} onOpenScanner={() => setShowWorkspaceScanner(true)} />
        ) : (
          <DndProvider>
            <MainLayout
              showRightPane={showRightPane}
              onOpenScanner={() => setShowWorkspaceScanner(true)}
              sidebarRef={sidebarRef}
            />
          </DndProvider>
        )}
      </div>

      <ToastContainer />
      <QuickSearch />
      <ShortcutHelp />
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
