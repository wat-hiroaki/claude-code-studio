import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { ChevronDown, Plus, Laptop, Server, Pencil, Trash2, Check, X } from 'lucide-react'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'
import { showToast } from './ToastContainer'
import type { Workspace } from '@shared/types'

const COLORS = ['#748ffc', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']

interface WorkspaceSwitcherProps {
  className?: string
}

export function WorkspaceSwitcher({ className }: WorkspaceSwitcherProps): JSX.Element {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { activeWorkspaceId, setActiveWorkspaceId } = useAppStore()

  const loadWorkspaces = useCallback(async () => {
    const ws = await window.api.getWorkspaces()
    setWorkspaces(ws)
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const handleSelect = async (id: string | null): Promise<void> => {
    if (editingId) return
    await window.api.setActiveWorkspace(id)
    setActiveWorkspaceId(id)
    setIsOpen(false)
  }

  const handleStartEdit = (ws: Workspace, e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditingId(ws.id)
    setEditName(ws.name)
    setEditColor(ws.color)
  }

  const handleSaveEdit = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!editingId || !editName.trim()) return
    try {
      await window.api.updateWorkspace(editingId, { name: editName.trim(), color: editColor })
      await loadWorkspaces()
      setEditingId(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handleCancelEdit = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditingId(null)
  }

  const handleDelete = async (ws: Workspace, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!confirm(t('workspace.confirmDelete', 'Delete workspace "{{name}}"? Agents will remain but become unassigned.', { name: ws.name }))) return
    try {
      await window.api.deleteWorkspace(ws.id)
      if (activeWorkspaceId === ws.id) {
        await window.api.setActiveWorkspace(null)
        setActiveWorkspaceId(null)
      }
      await loadWorkspaces()
      showToast(t('toast.workspaceDeleted', 'Workspace "{{name}}" deleted', { name: ws.name }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm',
          'border border-border/50 hover:bg-muted/50 transition-colors',
          'text-left'
        )}
      >
        {activeWorkspace ? (
          <>
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: activeWorkspace.color }}
            />
            <span className="truncate flex-1 font-medium">{activeWorkspace.name}</span>
            {activeWorkspace.connectionType === 'ssh' && (
              <Server size={12} className="text-muted-foreground shrink-0" />
            )}
          </>
        ) : (
          <>
            <Laptop size={14} className="text-muted-foreground shrink-0" />
            <span className="truncate flex-1 text-muted-foreground">
              {t('workspace.allAgents', 'All Agents')}
            </span>
          </>
        )}
        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {/* All agents option */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
              !activeWorkspaceId && 'bg-primary/10'
            )}
          >
            <Laptop size={14} className="text-muted-foreground" />
            <span>{t('workspace.allAgents', 'All Agents')}</span>
          </button>

          {workspaces.length > 0 && (
            <div className="border-t border-border/50">
              {workspaces.map((ws) => (
                <div key={ws.id}>
                  {editingId === ws.id ? (
                    <div className="px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 bg-secondary rounded text-xs outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(e as unknown as React.MouseEvent)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <button onClick={handleSaveEdit} className="p-1 rounded hover:bg-accent text-green-500">
                          <Check size={12} />
                        </button>
                        <button onClick={handleCancelEdit} className="p-1 rounded hover:bg-accent text-muted-foreground">
                          <X size={12} />
                        </button>
                      </div>
                      <div className="flex gap-0.5">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={cn('w-4 h-4 rounded-full border-2 transition-transform', editColor === c ? 'border-foreground scale-110' : 'border-transparent')}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-center">
                      <button
                        onClick={() => handleSelect(ws.id)}
                        className={cn(
                          'flex items-center gap-2 flex-1 px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                          activeWorkspaceId === ws.id && 'bg-primary/10'
                        )}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: ws.color }}
                        />
                        <span className="truncate flex-1 text-left">{ws.name}</span>
                        {ws.connectionType === 'ssh' && (
                          <Server size={12} className="text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                        <button
                          onClick={(e) => handleStartEdit(ws, e)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground"
                          title={t('common.edit', 'Edit')}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(ws, e)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-red-400"
                          title={t('common.delete', 'Delete')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border/50">
            <button
              onClick={() => {
                setIsOpen(false)
                setShowCreateDialog(true)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Plus size={14} />
              <span>{t('workspace.create', 'New Workspace')}</span>
            </button>
          </div>
        </div>
      )}

      {showCreateDialog && (
        <CreateWorkspaceDialog
          onClose={() => {
            setShowCreateDialog(false)
            loadWorkspaces()
          }}
        />
      )}
    </div>
  )
}
