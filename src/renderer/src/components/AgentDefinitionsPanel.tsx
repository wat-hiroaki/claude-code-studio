import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, BookTemplate } from 'lucide-react'
import { cn } from '@lib/utils'
import { AgentAvatar } from '@components/AgentAvatar'
import { showToast } from '@components/ToastContainer'
import type { AgentDefinition } from '@shared/types'

export function AgentDefinitionsPanel(): JSX.Element {
  const { t } = useTranslation()
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', icon: '', roleLabel: '', description: '' })

  const loadDefs = useCallback(async () => {
    const defs = await window.api.getAgentDefinitions()
    setDefinitions(defs)
  }, [])

  useEffect(() => {
    loadDefs()
  }, [loadDefs])

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim() || !form.description.trim()) return
    try {
      await window.api.createAgentDefinition({
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        roleLabel: form.roleLabel.trim() || null,
        description: form.description.trim()
      })
      setForm({ name: '', icon: '', roleLabel: '', description: '' })
      setShowCreate(false)
      loadDefs()
    } catch (err) {
      showToast(String(err), 'error')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.deleteAgentDefinition(id)
      loadDefs()
    } catch (err) {
      showToast(String(err), 'error')
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <BookTemplate size={14} />
          {t('agentDefs.title', 'Agent Definitions')}
          <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{definitions.length}</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-secondary/50 rounded-lg p-3 space-y-2 border border-border">
          <div className="flex gap-2">
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="🤖"
              className="w-10 text-center text-sm bg-background rounded px-1 py-1 border border-border"
            />
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('agentDefs.namePlaceholder', 'Definition Name')}
              className="flex-1 text-xs bg-background rounded px-2 py-1 border border-border"
            />
          </div>
          <input
            value={form.roleLabel}
            onChange={(e) => setForm({ ...form, roleLabel: e.target.value })}
            placeholder={t('agentDefs.rolePlaceholder', 'Role (optional)')}
            className="w-full text-xs bg-background rounded px-2 py-1 border border-border"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('agentDefs.descPlaceholder', 'Description / purpose of this agent...')}
            rows={2}
            className="w-full text-xs bg-background rounded px-2 py-1 border border-border resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setShowCreate(false)}
              className="text-[10px] px-2 py-1 rounded hover:bg-accent transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || !form.description.trim()}
              className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {t('common.create', 'Create')}
            </button>
          </div>
        </div>
      )}

      {/* Definitions List */}
      {definitions.length === 0 && !showCreate && (
        <div className="text-center py-6 text-[11px] text-muted-foreground">
          {t('agentDefs.empty', 'No agent definitions yet. Create one to save reusable agent profiles.')}
        </div>
      )}

      <div className="space-y-1.5">
        {definitions.map((def) => (
          <div
            key={def.id}
            className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border hover:bg-accent/30 transition-colors group"
          >
            <AgentAvatar agent={{ name: def.name, icon: def.icon }} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{def.name}</span>
                {def.roleLabel && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {def.roleLabel}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{def.description}</p>
              {def.skills.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {def.skills.map((skill) => (
                    <span key={skill} className="text-[8px] bg-secondary px-1 py-0.5 rounded">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDelete(def.id)}
              className={cn(
                'p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors',
                'opacity-0 group-hover:opacity-100'
              )}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
