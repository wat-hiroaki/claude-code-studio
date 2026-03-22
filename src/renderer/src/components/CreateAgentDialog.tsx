import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { X, FolderOpen, Server, Upload, ChevronDown, ChevronRight } from 'lucide-react'
import { showToast } from '@components/ToastContainer'
import { useOverlayClose } from '@lib/useOverlayClose'
import type { DiscoveredWorkspace, Workspace } from '@shared/types'

interface CreateAgentDialogProps {
  onClose: () => void
  prefill?: DiscoveredWorkspace | null
  workspaceId?: string
}

export function CreateAgentDialog({ onClose, prefill, workspaceId: workspaceIdProp }: CreateAgentDialogProps): JSX.Element {
  const { t } = useTranslation()
  const overlay = useOverlayClose(onClose)
  const { agents, addAgent, setSelectedAgent } = useAppStore()
  const [name, setName] = useState(prefill?.name || '')
  const [projectPath, setProjectPath] = useState(prefill?.path || '')
  const [projectName, setProjectName] = useState(prefill?.name || '')
  const [roleLabel, setRoleLabel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [skillsInput, setSkillsInput] = useState(prefill?.techStack.join(', ') || '')
  const [reportTo, setReportTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pathSuggestions, setPathSuggestions] = useState<{ name: string; path: string }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1)
  const pathInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  // Load active workspace info and auto-fill path
  useEffect(() => {
    const wsId = workspaceIdProp || useAppStore.getState().activeWorkspaceId
    if (!wsId) {
      setActiveWorkspace(null)
      return
    }
    window.api.getWorkspaces().then((wsList) => {
      const ws = wsList.find((w) => w.id === wsId) ?? null
      setActiveWorkspace(ws)
      // Auto-fill project path from workspace if no prefill was provided
      if (ws && !prefill) {
        if (ws.projects && ws.projects.length > 0) {
          // Use first project as default
          const firstProject = ws.projects[0]
          setProjectPath(firstProject.path)
          if (!projectName.trim()) {
            setProjectName(firstProject.name || ws.name)
          }
        } else if (ws.connectionType === 'ssh' && ws.sshConfig) {
          // SSH workspace without projects: use host as default project name
          if (!projectName.trim()) {
            setProjectName(`${ws.sshConfig.host}`)
          }
        }
      }
    })
  }, [prefill, workspaceIdProp])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const fetchSuggestions = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value || value.length < 2) {
      setPathSuggestions([])
      setShowSuggestions(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const dirs = await window.api.listDirs(value)
      setPathSuggestions(dirs)
      setShowSuggestions(dirs.length > 0)
      setSelectedSuggestion(-1)
      // Compute portal position from input
      if (pathInputRef.current && dirs.length > 0) {
        const rect = pathInputRef.current.getBoundingClientRect()
        setPortalPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
      }
    }, 150)
  }, [])

  const handlePathChange = (value: string): void => {
    setProjectPath(value)
    fetchSuggestions(value)
  }

  const applySuggestion = (suggestion: { name: string; path: string }): void => {
    setProjectPath(suggestion.path)
    setShowSuggestions(false)
    if (!projectName.trim()) {
      setProjectName(suggestion.name)
    }
    if (!name.trim()) {
      setName(`${suggestion.name} Dev`)
    }
    // Continue suggesting deeper paths
    fetchSuggestions(suggestion.path + '/')
    pathInputRef.current?.focus()
  }

  const handlePathKeyDown = (e: React.KeyboardEvent): void => {
    if (!showSuggestions || pathSuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestion((prev) => Math.min(prev + 1, pathSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestion((prev) => Math.max(prev - 1, -1))
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (selectedSuggestion >= 0) {
        e.preventDefault()
        applySuggestion(pathSuggestions[selectedSuggestion])
      } else if (e.key === 'Tab' && pathSuggestions.length === 1) {
        e.preventDefault()
        applySuggestion(pathSuggestions[0])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Update portal position on scroll/resize and close on outside click
  useEffect(() => {
    const updatePos = (): void => {
      if (pathInputRef.current && showSuggestions) {
        const rect = pathInputRef.current.getBoundingClientRect()
        setPortalPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
      }
    }
    const handleClick = (e: MouseEvent): void => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          pathInputRef.current && !pathInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [showSuggestions])

  const handleSelectFolder = async (): Promise<void> => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setProjectPath(folder)
      const parts = folder.replace(/\\/g, '/').split('/')
      const folderName = parts[parts.length - 1] || ''
      if (!projectName.trim()) {
        setProjectName(folderName)
      }
      if (!name.trim() && folderName) {
        // Auto-suggest agent name from folder
        setName(`${folderName} Dev`)
      }
    }
  }

  const handleCreate = async (): Promise<void> => {
    if (!name.trim() || !projectPath.trim() || !projectName.trim()) return

    setLoading(true)
    setError(null)
    try {
      const skills = skillsInput.split(',').map((s) => s.trim()).filter(Boolean)
      const resolvedWsId = workspaceIdProp || useAppStore.getState().activeWorkspaceId || undefined
      const agent = await window.api.createAgent({
        name: name.trim(),
        projectPath: projectPath.trim(),
        projectName: projectName.trim(),
        roleLabel: roleLabel.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        skills: skills.length > 0 ? skills : undefined,
        reportTo: reportTo || undefined,
        workspaceId: resolvedWsId
      })
      addAgent(agent)
      setSelectedAgent(agent.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={overlay.onMouseDown} onClick={overlay.onClick} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[480px] max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{t('agent.new')}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                try {
                  const template = await window.api.importAgentTemplate()
                  if (template) {
                    setName(template.name)
                    setRoleLabel(template.roleLabel ?? '')
                    setSystemPrompt(template.systemPrompt ?? '')
                    setSkillsInput(template.skills.join(', '))
                    showToast(t('toast.templateLoaded', 'Template "{{name}}" loaded', { name: template.name }), 'success')
                  }
                } catch (err) {
                  showToast(err instanceof Error ? err.message : String(err), 'error')
                }
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground transition-colors"
              title={t('agent.importTemplate', 'Import from template')}
            >
              <Upload size={12} />
              Template
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-accent">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Workspace indicator */}
          {activeWorkspace && (
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg text-xs">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeWorkspace.color }} />
              <span className="text-muted-foreground">{t('agent.workspace', 'Workspace')}:</span>
              <span className="font-medium">{activeWorkspace.name}</span>
              {activeWorkspace.connectionType === 'ssh' && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-500 text-[10px]">
                  <Server size={9} />
                  SSH
                </span>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('agent.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agent.rolePlaceholder', 'e.g., Frontend Dev')}
              className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('agent.projectPath')}</label>
            {/* Quick-select from workspace projects */}
            {activeWorkspace && activeWorkspace.projects && activeWorkspace.projects.length > 0 && (
              <select
                value={projectPath}
                onChange={(e) => {
                  const selected = activeWorkspace.projects.find(p => p.path === e.target.value)
                  if (selected) {
                    setProjectPath(selected.path)
                    if (!projectName.trim() || activeWorkspace.projects.some(p => p.name === projectName)) {
                      setProjectName(selected.name)
                    }
                  } else if (e.target.value === '__manual__') {
                    setProjectPath('')
                    setProjectName('')
                  }
                }}
                className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
              >
                {activeWorkspace.projects.map(p => (
                  <option key={p.path} value={p.path}>{p.name}</option>
                ))}
                <option value="__manual__">{t('agent.manualPath', 'Manual input...')}</option>
              </select>
            )}
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <input
                  ref={pathInputRef}
                  type="text"
                  value={projectPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  onKeyDown={handlePathKeyDown}
                  onFocus={() => { if (projectPath.length >= 2) fetchSuggestions(projectPath) }}
                  placeholder={activeWorkspace?.connectionType === 'ssh' ? '/home/user/project' : '~/workSpace/project'}
                  className="w-full px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
                  autoComplete="off"
                />
{/* Portal rendered at dialog root level */}
              </div>
              <button
                onClick={handleSelectFolder}
                className="px-3 py-2 bg-secondary rounded-lg hover:bg-accent transition-colors"
                title={t('common.browse', 'Browse...')}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('agent.project')}</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('agent.namePlaceholder', 'My Project')}
              className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
            />
          </div>

          {/* Advanced Options (collapsed by default) */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {t('agent.advanced', 'Advanced Options')}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pl-2 border-l-2 border-border/50">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('agent.role')}</label>
                <input
                  type="text"
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder={t('agent.tagPlaceholder', 'frontend / backend / test')}
                  className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('agent.skills')}</label>
                <input
                  type="text"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder={t('agent.skillsPlaceholder')}
                  className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('agent.reportsTo')}</label>
                <select
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
                >
                  <option value="">— {t('agent.noTeam')} —</option>
                  {activeAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.roleLabel ? ` (${a.roleLabel})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('agent.systemPrompt')}</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={t('agent.systemPromptPlaceholder', 'Optional: Define the agent\'s role...')}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 p-2 bg-destructive/10 text-destructive text-xs rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !projectPath.trim() || !projectName.trim() || loading}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.loading') : t('common.create')}
          </button>
        </div>
      </div>

      {/* Path suggestions dropdown — rendered outside dialog card to avoid clipping */}
      {showSuggestions && pathSuggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'fixed',
            top: portalPos.top,
            left: portalPos.left,
            width: portalPos.width
          }}
          className="bg-card rounded-lg shadow-2xl max-h-[240px] overflow-y-auto border border-border"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {pathSuggestions.map((s, i) => (
            <button
              key={s.path}
              onClick={() => applySuggestion(s)}
              onMouseEnter={() => setSelectedSuggestion(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
                i === selectedSuggestion ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
            >
              <FolderOpen size={13} className="text-blue-400 shrink-0" />
              <span className="font-medium truncate">{s.name}</span>
              <span className="text-muted-foreground/60 truncate ml-auto text-[10px] font-mono">{s.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
