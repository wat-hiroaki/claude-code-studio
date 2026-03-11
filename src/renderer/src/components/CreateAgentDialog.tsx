import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { X, FolderOpen } from 'lucide-react'
import type { DiscoveredWorkspace } from '@shared/types'

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
  const activeAgents = agents.filter((a) => a.status !== 'archived')

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
      if (!projectName.trim()) {
        // Auto-fill project name from folder name
        const parts = folder.replace(/\\/g, '/').split('/')
        setProjectName(parts[parts.length - 1] || '')
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
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('agent.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Frontend Dev"
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
                placeholder="C:/Users/user/my-project"
                className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
              />
              <button
                onClick={handleSelectFolder}
                className="px-3 py-2 bg-secondary rounded-lg hover:bg-accent transition-colors"
                title="Browse..."
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
              placeholder="My Project"
              className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('agent.role')}</label>
            <input
              type="text"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="frontend / backend / test"
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
              placeholder="Optional: Define the agent's role..."
              rows={3}
              className="w-full mt-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none resize-none"
            />
          </div>
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
