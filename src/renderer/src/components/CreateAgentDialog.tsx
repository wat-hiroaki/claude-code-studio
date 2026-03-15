import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { X, FolderOpen, Server, Upload, ChevronDown, ChevronRight } from 'lucide-react'
import { showToast } from './ToastContainer'
import type { DiscoveredWorkspace, Workspace } from '@shared/types'

interface CreateAgentDialogProps {
  onClose: () => void
  prefill?: DiscoveredWorkspace | null
}

export function CreateAgentDialog({ onClose, prefill }: CreateAgentDialogProps): JSX.Element {
  const { t } = useTranslation()
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
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  // Load active workspace info and auto-fill path
  useEffect(() => {
    const wsId = useAppStore.getState().activeWorkspaceId
    if (!wsId) {
      setActiveWorkspace(null)
      return
    }
    window.api.getWorkspaces().then((wsList) => {
      const ws = wsList.find((w) => w.id === wsId) ?? null
      setActiveWorkspace(ws)
      // Auto-fill project path from workspace if no prefill was provided
      if (ws?.path && !prefill) {
        setProjectPath(ws.path)
        const parts = ws.path.replace(/\\/g, '/').split('/')
        const folderName = parts[parts.length - 1] || ''
        if (!projectName.trim()) {
          setProjectName(folderName || ws.name)
        }
      }
    })
  }, [prefill])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
      const agent = await window.api.createAgent({
        name: name.trim(),
        projectPath: projectPath.trim(),
        projectName: projectName.trim(),
        roleLabel: roleLabel.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        skills: skills.length > 0 ? skills : undefined,
        reportTo: reportTo || undefined
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[480px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
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
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder={activeWorkspace?.connectionType === 'ssh' ? '/home/user/my-project' : 'C:/Users/user/my-project'}
                className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
              />
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
    </div>
  )
}
