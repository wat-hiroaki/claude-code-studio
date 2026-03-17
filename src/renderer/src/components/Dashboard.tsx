import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import {
  Users, AlertCircle, XCircle, CheckCircle2, FileText,
  GitBranch, Plus, X, HardDrive, Brain, Radar, Map as MapIcon
} from 'lucide-react'
import { cn } from '../lib/utils'
import { DailyReport } from './DailyReport'
import { ActivityMap } from './ActivityMap'
import { ChainGraph } from './ChainGraph'
import { ActivityStream } from './ActivityStream'
// ScheduledTasksPanel merged into ChainGraph
import type { Team, Workspace } from '@shared/types'

const LazyConfigMap = lazy(() => import('./ConfigMap').then(m => ({ default: m.ConfigMap })))

type DashboardView = 'activityMap' | 'chainGraph' | 'scheduler' | 'configMap'

interface DashboardProps {
  onOpenScanner?: () => void
  fullHeight?: boolean
}

export function Dashboard({ onOpenScanner, fullHeight }: DashboardProps): JSX.Element {
  const { t } = useTranslation()
  const { teamStats, setSelectedAgent, dashboardActiveView, setDashboardActiveView } = useAppStore()
  const [showDailyReport, setShowDailyReport] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamColor, setNewTeamColor] = useState('#6366f1')

  const loadTeams = useCallback(async () => {
    const result = await window.api.getTeams()
    setTeams(result)
  }, [])

  const loadWorkspaces = useCallback(async () => {
    const result = await window.api.getWorkspaces()
    setWorkspaces(result)
  }, [])

  useEffect(() => {
    loadTeams()
    loadWorkspaces()
  }, [loadTeams, loadWorkspaces])

  const handleAgentClick = useCallback((id: string): void => {
    setSelectedAgent(id)
  }, [setSelectedAgent])

  const handleCreateTeam = async (): Promise<void> => {
    if (!newTeamName.trim()) return
    await window.api.createTeam(newTeamName.trim(), newTeamColor)
    setNewTeamName('')
    setShowNewTeam(false)
    loadTeams()
  }

  const handleDeleteTeam = async (id: string): Promise<void> => {
    await window.api.deleteTeam(id)
    loadTeams()
  }

  const views: { key: DashboardView; icon: typeof Radar; label: string }[] = [
    { key: 'activityMap', icon: Radar, label: t('teamMgmt.activityMap') },
    { key: 'chainGraph', icon: GitBranch, label: t('teamMgmt.chains', 'Chains') },
    { key: 'configMap', icon: MapIcon, label: t('teamMgmt.configMap', 'Config Map') }
  ]

  const teamColors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4']

  return (
    <div className={cn(
      "bg-card p-4 space-y-4 overflow-y-auto flex flex-col",
      fullHeight ? "h-full flex-1" : "border-b border-border max-h-[60vh]"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('teamMgmt.title')}</h2>
        <div className="flex items-center gap-2">
          {onOpenScanner && (
            <button
              onClick={onOpenScanner}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-accent transition-colors"
            >
              <HardDrive size={14} />
              {t('workspace.button')}
            </button>
          )}
          <button
            onClick={() => setShowDailyReport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary hover:bg-accent transition-colors"
          >
            <FileText size={14} />
            {t('dailyReport.button')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <Users size={20} className="text-green-600 dark:text-green-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.active}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.active')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <Brain size={20} className="text-purple-600 dark:text-purple-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.thinking}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.thinking', 'Thinking')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <AlertCircle size={20} className="text-orange-600 dark:text-orange-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.awaiting}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.awaiting')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <XCircle size={20} className="text-red-600 dark:text-red-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.error}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.errors')}</div>
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-blue-600 dark:text-blue-500" />
          <div>
            <div className="text-2xl font-bold">{teamStats.completedToday}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.completedToday')}</div>
          </div>
        </div>
      </div>

      {/* View Switcher + Team Management */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5" role="tablist">
          {views.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={dashboardActiveView === key}
              onClick={() => setDashboardActiveView(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
                dashboardActiveView === key
                  ? 'bg-card shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Team chips + new team */}
        <div className="flex items-center gap-1.5">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border border-border"
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
              <span>{team.name}</span>
              <button
                onClick={() => handleDeleteTeam(team.id)}
                className="ml-0.5 hover:text-destructive"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {showNewTeam ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                placeholder={t('teamMgmt.teamName')}
                className="w-24 px-2 py-1 text-[10px] bg-secondary rounded border-none outline-none"
                autoFocus
              />
              <div className="flex gap-0.5">
                {teamColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTeamColor(color)}
                    className={cn('w-3.5 h-3.5 rounded-full border', newTeamColor === color ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button onClick={handleCreateTeam} className="text-[10px] text-primary hover:underline">{t('common.ok', 'OK')}</button>
              <button onClick={() => setShowNewTeam(false)} className="text-[10px] text-muted-foreground">
                <X size={10} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewTeam(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border border-dashed border-border hover:bg-accent transition-colors"
            >
              <Plus size={10} />
              {t('teamMgmt.newTeam')}
            </button>
          )}
        </div>
      </div>

      {/* Active View */}
      <div className="flex-1 min-h-[120px]">
        {dashboardActiveView === 'activityMap' && (
          <div className="flex gap-2 h-full">
            {/* Activity Stream — left sidebar */}
            <div className="w-72 shrink-0 border border-border rounded-md overflow-hidden bg-card">
              <ActivityStream className="h-full" onAgentClick={handleAgentClick} />
            </div>
            {/* Activity Map — main area */}
            <div className="flex-1 min-w-0">
              <ActivityMap teams={teams} onAgentClick={handleAgentClick} />
            </div>
          </div>
        )}
        {dashboardActiveView === 'chainGraph' && (
          <div className="h-full">
            <ChainGraph onAgentClick={handleAgentClick} />
          </div>
        )}
        {dashboardActiveView === 'configMap' && (
          <Suspense fallback={<div className="flex items-center justify-center h-40 text-muted-foreground text-xs">Loading...</div>}>
            <div className="h-full">
              <LazyConfigMap workspaces={workspaces} />
            </div>
          </Suspense>
        )}
      </div>

      {showDailyReport && (
        <DailyReport onClose={() => setShowDailyReport(false)} />
      )}
    </div>
  )
}
