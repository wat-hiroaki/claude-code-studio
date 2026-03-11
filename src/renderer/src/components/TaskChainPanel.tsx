import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import {
  Link,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react'
import type { TaskChain } from '@shared/types'

type TriggerConditionType = 'complete' | 'keyword' | 'no_error'
type OnErrorType = 'stop' | 'skip' | 'notify_only'

interface ChainFormState {
  name: string
  triggerAgentId: string
  conditionType: TriggerConditionType
  keyword: string
  targetAgentId: string
  messageTemplate: string
  onError: OnErrorType
}

const initialForm: ChainFormState = {
  name: '',
  triggerAgentId: '',
  conditionType: 'complete',
  keyword: '',
  targetAgentId: '',
  messageTemplate: '',
  onError: 'stop'
}

export function TaskChainPanel(): JSX.Element {
  const { t } = useTranslation()
  const { agents } = useAppStore()
  const [chains, setChains] = useState<TaskChain[]>([])
  const [showForm, setShowForm] = useState(false)
  const [expandedChainId, setExpandedChainId] = useState<string | null>(null)
  const [form, setForm] = useState<ChainFormState>(initialForm)
  const [loading, setLoading] = useState(false)

  const loadChains = useCallback(async () => {
    const data = await window.api.getChains()
    setChains(data)
  }, [])

  useEffect(() => {
    loadChains()
  }, [loadChains])

  const handleCreate = async (): Promise<void> => {
    if (!form.name.trim() || !form.triggerAgentId || !form.targetAgentId || !form.messageTemplate.trim()) {
      return
    }
    setLoading(true)
    try {
      const newChain = await window.api.createChain({
        name: form.name.trim(),
        triggerAgentId: form.triggerAgentId,
        triggerCondition: {
          type: form.conditionType,
          ...(form.conditionType === 'keyword' ? { keyword: form.keyword } : {})
        },
        targetAgentId: form.targetAgentId,
        messageTemplate: form.messageTemplate.trim(),
        onError: form.onError,
        isActive: true
      })
      setChains((prev) => [...prev, newChain])
      setForm(initialForm)
      setShowForm(false)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (chain: TaskChain): Promise<void> => {
    const updated = await window.api.updateChain(chain.id, { isActive: !chain.isActive })
    setChains((prev) => prev.map((c) => (c.id === chain.id ? updated : c)))
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.deleteChain(id)
    setChains((prev) => prev.filter((c) => c.id !== id))
  }

  const getAgentName = (id: string): string => {
    return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Link size={16} className="text-primary" />
          <h3 className="text-sm font-semibold">{t('chain.title')}</h3>
          <span className="text-xs text-muted-foreground">({chains.length})</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? t('common.cancel') : t('chain.new')}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-4 border-b border-border space-y-3 bg-secondary/30">
          {/* Chain Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Build then Test"
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
            />
          </div>

          {/* Trigger Agent */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.trigger')}</label>
            <select
              value={form.triggerAgentId}
              onChange={(e) => setForm({ ...form, triggerAgentId: e.target.value })}
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
            >
              <option value="">{t('chain.selectAgent')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.roleLabel ? `(${a.roleLabel})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.condition')}</label>
            <select
              value={form.conditionType}
              onChange={(e) => setForm({ ...form, conditionType: e.target.value as TriggerConditionType })}
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
            >
              <option value="complete">{t('chain.conditions.complete')}</option>
              <option value="keyword">{t('chain.conditions.keyword')}</option>
              <option value="no_error">{t('chain.conditions.no_error')}</option>
            </select>
          </div>

          {/* Keyword Input (conditional) */}
          {form.conditionType === 'keyword' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('chain.keyword')}</label>
              <input
                type="text"
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                placeholder="e.g., DONE"
                className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
              />
            </div>
          )}

          {/* Target Agent */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.target')}</label>
            <select
              value={form.targetAgentId}
              onChange={(e) => setForm({ ...form, targetAgentId: e.target.value })}
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
            >
              <option value="">{t('chain.selectAgent')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.roleLabel ? `(${a.roleLabel})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Message Template */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.message')}</label>
            <textarea
              value={form.messageTemplate}
              onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
              placeholder={t('chain.messagePlaceholder')}
              rows={2}
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none resize-none"
            />
          </div>

          {/* On Error */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('chain.onError')}</label>
            <select
              value={form.onError}
              onChange={(e) => setForm({ ...form, onError: e.target.value as OnErrorType })}
              className="w-full mt-1 px-3 py-1.5 bg-secondary rounded-md text-sm outline-none"
            >
              <option value="stop">{t('chain.errorHandling.stop')}</option>
              <option value="skip">{t('chain.errorHandling.skip')}</option>
              <option value="notify_only">{t('chain.errorHandling.notify_only')}</option>
            </select>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={
              !form.name.trim() ||
              !form.triggerAgentId ||
              !form.targetAgentId ||
              !form.messageTemplate.trim() ||
              loading
            }
            className="w-full px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.loading') : t('common.create')}
          </button>
        </div>
      )}

      {/* Chain List */}
      <div className="flex-1 overflow-y-auto">
        {chains.length === 0 && !showForm && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('chain.empty')}
          </div>
        )}

        {chains.map((chain) => {
          const isExpanded = expandedChainId === chain.id
          return (
            <div
              key={chain.id}
              className={cn(
                'border-b border-border',
                !chain.isActive && 'opacity-50'
              )}
            >
              {/* Chain Header */}
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() => setExpandedChainId(isExpanded ? null : chain.id)}
                  className="p-0.5 rounded hover:bg-accent transition-colors"
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{chain.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {getAgentName(chain.triggerAgentId)} → {getAgentName(chain.targetAgentId)}
                  </div>
                </div>

                {/* Toggle Active */}
                <button
                  onClick={() => handleToggleActive(chain)}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  title={chain.isActive ? t('chain.deactivate') : t('chain.activate')}
                >
                  {chain.isActive ? (
                    <ToggleRight size={18} className="text-green-500" />
                  ) : (
                    <ToggleLeft size={18} className="text-muted-foreground" />
                  )}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(chain.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('chain.condition')}:</span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary">
                      {t(`chain.conditions.${chain.triggerCondition.type}`)}
                      {chain.triggerCondition.keyword && ` "${chain.triggerCondition.keyword}"`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('chain.message')}:</span>
                    <p className="mt-1 p-2 bg-secondary rounded-md font-mono text-[11px] whitespace-pre-wrap">
                      {chain.messageTemplate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('chain.onError')}:</span>
                    <span>{t(`chain.errorHandling.${chain.onError}`)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
