import { useRef, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { EmojiPicker } from '@components/EmojiPicker'
import { showToast } from '@components/ToastContainer'
import {
  RotateCw,
  Archive,
  Copy,
  Pin,
  PinOff,
  Download,
  Trash2,
  Smile
} from 'lucide-react'
import type { Agent } from '@shared/types'
import type { Workspace } from '@shared/types'

interface ContextMenuState {
  agentId: string
  x: number
  y: number
}

interface AgentContextMenuProps {
  contextMenu: ContextMenuState
  onClose: () => void
  workspaces: Workspace[]
}

export function AgentContextMenu({ contextMenu, onClose, workspaces }: AgentContextMenuProps): JSX.Element | null {
  const { t } = useTranslation()
  const { agents, selectedAgentId, setSelectedAgent } = useAppStore()
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<string | null>(null)
  const emojiAnchorRef = useRef<HTMLButtonElement>(null)

  const ctxAgent = agents.find((a) => a.id === contextMenu.agentId)

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleArchiveAgent = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    onClose()
    const confirmed = await window.api.confirm(t('agent.confirmArchive', 'Archive agent "{{name}}"?', { name: agent.name }))
    if (!confirmed) return
    try {
      await window.api.archiveAgent(agentId)
      useAppStore.getState().updateAgentInList(agentId, { status: 'archived' })
      const remaining = agents.filter((a) => a.id !== agentId && a.status !== 'archived')
      if (selectedAgentId === agentId) {
        setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents, selectedAgentId, setSelectedAgent, onClose])

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    onClose()
    const confirmed = await window.api.confirm(t('agent.confirmDelete', 'Permanently delete agent "{{name}}"? This cannot be undone.', { name: agent.name }))
    if (!confirmed) return
    try {
      await window.api.deleteAgent(agentId)
      useAppStore.getState().removeAgent(agentId)
      const remaining = agents.filter((a) => a.id !== agentId)
      if (selectedAgentId === agentId) {
        setSelectedAgent(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents, selectedAgentId, setSelectedAgent, onClose])

  const handleRestartAgent = useCallback(async (agentId: string) => {
    onClose()
    try {
      await window.api.restartAgent(agentId)
      showToast(t('toast.agentRestarted', 'Agent restarted'), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [onClose])

  const handleTogglePin = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    onClose()
    await window.api.updateAgent(agentId, { isPinned: !agent.isPinned })
    useAppStore.getState().updateAgentInList(agentId, { isPinned: !agent.isPinned })
  }, [agents, onClose])

  const handleDuplicate = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    onClose()
    try {
      const newAgent = await window.api.createAgent({
        name: `${agent.name} (copy)`,
        projectPath: agent.projectPath,
        projectName: agent.projectName,
        roleLabel: agent.roleLabel ?? undefined,
        systemPrompt: agent.systemPrompt ?? undefined,
        skills: agent.skills.length > 0 ? agent.skills : undefined,
        reportTo: agent.reportTo ?? undefined,
        workspaceId: agent.workspaceId ?? undefined
      })
      useAppStore.getState().addAgent(newAgent)
      setSelectedAgent(newAgent.id)
      showToast(t('toast.agentCreated', 'Agent "{{name}}" created', { name: newAgent.name }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [agents, setSelectedAgent, onClose])

  const handleExportTemplate = useCallback(async (agentId: string) => {
    onClose()
    try {
      const path = await window.api.exportAgentTemplate(agentId)
      if (path) showToast(t('toast.templateExported', 'Template exported to {{path}}', { path }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [onClose])

  if (!ctxAgent) return null

  return (
    <div
      ref={contextMenuRef}
      className="fixed z-[100] bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {/* Agent details header -- editable fields */}
      <div className="px-3 py-2 border-b border-border/50 space-y-1.5">
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">{t('agent.project', 'Project')}:</span>
          <input
            className="ml-1 bg-background border border-border/50 rounded px-1 py-0 text-[10px] font-mono w-full mt-0.5 outline-none focus:border-primary"
            defaultValue={ctxAgent.projectName}
            onBlur={async (e) => {
              const val = e.target.value.trim()
              if (val && val !== ctxAgent.projectName) {
                await window.api.updateAgent(ctxAgent.id, { projectName: val })
                useAppStore.getState().updateAgentInList(ctxAgent.id, { projectName: val })
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">{t('agent.projectPath', 'Path')}:</span>
          <input
            className="ml-1 bg-background border border-border/50 rounded px-1 py-0 text-[10px] font-mono w-full mt-0.5 outline-none focus:border-primary"
            defaultValue={ctxAgent.projectPath || ''}
            placeholder="/home/user/project"
            onBlur={async (e) => {
              const val = e.target.value.trim()
              if (val !== (ctxAgent.projectPath || '')) {
                await window.api.updateAgent(ctxAgent.id, { projectPath: val || null })
                useAppStore.getState().updateAgentInList(ctxAgent.id, { projectPath: val || undefined })
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">{t('agent.workspace', 'Workspace')}:</span>{' '}
          {(() => {
            const ws = workspaces.find(w => w.id === ctxAgent.workspaceId)
            return ws ? (
              <span>{ws.name} {ws.connectionType === 'ssh' ? <span className="text-cyan-500 font-mono">[SSH]</span> : <span className="text-green-500 font-mono">[Local]</span>}</span>
            ) : <span>—</span>
          })()}
        </div>
        {ctxAgent.roleLabel && (
          <div className="text-[10px] text-muted-foreground">
            <span className="font-medium">{t('agent.role', 'Role')}:</span> {ctxAgent.roleLabel}
          </div>
        )}
      </div>

      <button
        onClick={() => handleTogglePin(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        {ctxAgent.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        {ctxAgent.isPinned ? t('agent.actions.unpin') : t('agent.actions.pin')}
      </button>
      <button
        ref={emojiAnchorRef}
        onClick={() => setEmojiPickerTarget(emojiPickerTarget === ctxAgent.id ? null : ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        <Smile size={12} />
        {t('agent.actions.changeIcon', 'Change Icon')}
      </button>
      <button
        onClick={() => handleRestartAgent(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        <RotateCw size={12} />
        {t('agent.actions.restart')}
      </button>
      <button
        onClick={() => handleDuplicate(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        <Copy size={12} />
        {t('agent.actions.duplicate', 'Duplicate')}
      </button>
      <button
        onClick={() => handleExportTemplate(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        <Download size={12} />
        {t('agent.actions.exportTemplate', 'Export Template')}
      </button>
      <div className="border-t border-border/50 my-1" />
      <button
        onClick={() => handleArchiveAgent(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-red-400 transition-colors"
      >
        <Archive size={12} />
        {t('agent.actions.archive')}
      </button>
      <button
        onClick={() => handleDeleteAgent(ctxAgent.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-red-500 transition-colors"
      >
        <Trash2 size={12} />
        {t('agent.actions.delete', 'Delete')}
      </button>
      {/* Emoji picker inline */}
      {emojiPickerTarget === ctxAgent.id && (
        <div className="relative">
          <EmojiPicker
            value={ctxAgent.icon}
            onChange={async (emoji) => {
              try {
                await window.api.updateAgent(ctxAgent.id, { icon: emoji })
                useAppStore.getState().updateAgentInList(ctxAgent.id, { icon: emoji })
              } catch (err) {
                showToast(String(err), 'error')
              }
              setEmojiPickerTarget(null)
              onClose()
            }}
            onClose={() => setEmojiPickerTarget(null)}
            anchorRef={emojiAnchorRef}
          />
        </div>
      )}
    </div>
  )
}
