import { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels'
import { useAppStore } from './stores/useAppStore'
import { TitleBar } from './components/TitleBar'
import { AgentList } from './components/AgentList'
import { TerminalView } from './components/TerminalView'
import { PtyTerminalView } from './components/PtyTerminalView'
import { ContextPane } from './components/ContextPane'
import { Dashboard } from './components/Dashboard'
import { CreateAgentDialog } from './components/CreateAgentDialog'
import { ToastContainer, showToast } from './components/ToastContainer'
import { QuickSearch } from './components/QuickSearch'
import { ShortcutHelp } from './components/ShortcutHelp'
import { WelcomeScreen } from './components/WelcomeScreen'
import { WorkspaceScanner } from './components/WorkspaceScanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ResizeHandle } from './components/ResizeHandle'
import { UpdateBanner } from './components/UpdateBanner'

import type { DiscoveredWorkspace } from '@shared/types'

interface PaneGridProps {
  onOpenScanner?: () => void
}

function PaneGrid({ onOpenScanner }: PaneGridProps): JSX.Element {
  const { selectedAgentId, paneLayout, paneAgentIds, setPaneAgent, swapPanes, agents, usePtyMode } = useAppStore()
  const { t } = useTranslation()

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
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <Dashboard fullHeight onOpenScanner={onOpenScanner} />
        </div>
      )
    }
    return (
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        {usePtyMode
          ? <PtyTerminalView agentId={selectedAgentId} />
          : <TerminalView agentId={selectedAgentId} />}
      </div>
    )
  }

  const renderPane = (i: number): JSX.Element => {
    const agentId = paneAgentIds[i]
    // Show Dashboard in first pane when no agent is selected globally
    if (i === 0 && !selectedAgentId && !agentId) {
      return <Dashboard fullHeight onOpenScanner={onOpenScanner} />
    }
    if (!agentId) {
      // Filter out agents already assigned to other panes (prevent duplicates)
      const assignedIds = new Set(paneAgentIds.filter((id, idx) => id && idx !== i))
      const available = agents.filter((a) => a.status !== 'archived' && !assignedIds.has(a.id))
      return (
        <div className="flex flex-col h-full items-center justify-center bg-card text-muted-foreground gap-2">
          <p className="text-xs">{t('pane.label', 'Pane')} {i + 1}</p>
          <div className="flex flex-wrap gap-1 max-w-[240px] justify-center">
            {available.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50">No available agents</p>
            ) : (
              available.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setPaneAgent(i, a.id)}
                  className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors flex flex-col items-center"
                  title={a.workspaceId || undefined}
                >
                  <span>{a.name}</span>
                  {a.workspaceId && (
                    <span className="text-[8px] text-muted-foreground/60">
                      {a.workspaceId.split('/').pop()}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )
    }

    // Pane toolbar: swap buttons + close
    const maxPane = paneLayout === 4 ? 3 : 1
    const agentName = agents.find(a => a.id === agentId)?.name || ''
    const paneToolbar = (
      <div className="flex items-center justify-between px-2 py-0.5 bg-card/80 border-b border-border/40">
        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
          {t('pane.label', 'Pane')} {i + 1}{agentName ? ` · ${agentName}` : ''}
        </span>
        <div className="flex items-center gap-0.5">
          {/* Swap with other panes */}
          {Array.from({ length: maxPane + 1 }, (_, j) => j).filter(j => j !== i && paneAgentIds[j]).map(j => (
            <button
              key={`swap-${j}`}
              onClick={() => swapPanes(i, j)}
              className="text-[9px] px-1.5 py-0.5 rounded hover:bg-accent text-muted-foreground transition-colors"
              title={t('pane.swapWith', 'Swap with Pane {{n}}', { n: j + 1 })}
            >
              ⇄{j + 1}
            </button>
          ))}
          <button
            onClick={() => setPaneAgent(i, null)}
            className="text-[10px] px-1.5 py-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-1"
            title={t('common.close', 'Close')}
          >
            ✕
          </button>
        </div>
      </div>
    )

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {paneToolbar}
        <div className="flex-1 min-h-0 overflow-hidden">
          {usePtyMode ? (
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
          )}
        </div>
      </div>
    )
  }

  if (paneLayout === 2) {
    return (
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
        <Panel defaultSize="50%" minSize={150}>
          {renderPane(0)}
        </Panel>
        <ResizeHandle />
        <Panel defaultSize="50%" minSize={150}>
          {renderPane(1)}
        </Panel>
      </Group>
    )
  }

  // 4-pane layout
  return (
    <Group orientation="vertical" className="flex-1 overflow-hidden">
      <Panel defaultSize="50%" minSize={100}>
        <Group orientation="horizontal">
          <Panel defaultSize="50%" minSize={150}>
            {renderPane(0)}
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="50%" minSize={150}>
            {renderPane(1)}
          </Panel>
        </Group>
      </Panel>
      <ResizeHandle direction="vertical" />
      <Panel defaultSize="50%" minSize={100}>
        <Group orientation="horizontal">
          <Panel defaultSize="50%" minSize={150}>
            {renderPane(2)}
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="50%" minSize={150}>
            {renderPane(3)}
          </Panel>
        </Group>
      </Panel>
    </Group>
  )
}

interface MainLayoutProps {
  showRightPane: boolean
  onOpenScanner?: () => void
}

function MainLayout({ showRightPane, onOpenScanner }: MainLayoutProps): JSX.Element {
  const panelIds = showRightPane
    ? ['sidebar', 'terminal', 'context']
    : ['sidebar', 'terminal']

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `main-layout-${showRightPane ? '3' : '2'}`,
    panelIds,
  })

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
      >
        <ErrorBoundary fallbackMessage="Sidebar failed to render">
          <AgentList />
        </ErrorBoundary>
      </Panel>
      <ResizeHandle />
      <Panel id="terminal" minSize={300}>
        <ErrorBoundary fallbackMessage="Terminal failed to render">
          <PaneGrid onOpenScanner={onOpenScanner} />
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
          if (agentToArchive && confirm(t('agent.confirmArchive', 'Archive agent "{{name}}"?', { name: agentToArchive.name }))) {
            window.api.archiveAgent(selectedAgentId)
            const remaining = agents.filter((a) => a.id !== selectedAgentId && a.status !== 'archived')
            setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
            loadAgents()
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
          <MainLayout showRightPane={showRightPane} onOpenScanner={() => setShowWorkspaceScanner(true)} />
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
