import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { ChevronDown, ChevronRight, Plus, Laptop, Server, Pencil, Trash2, Check, X, AlertTriangle, FolderOpen } from 'lucide-react'
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { activeWorkspaceId, setActiveWorkspaceId, invalidProjects, setInvalidProjects } = useAppStore()

  const loadWorkspaces = useCallback(async () => {
    const ws = await window.api.getWorkspaces()
    setWorkspaces(ws)
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  // Listen for workspace path invalid events from main process
  useEffect(() => {
    const unsub = window.api.onWorkspacePathInvalid((invalid) => {
      setInvalidProjects(invalid)
    })
    return unsub
  }, [setInvalidProjects])

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

  const toggleExpanded = (wsId: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(wsId)) next.delete(wsId)
      else next.add(wsId)
      return next
    })
  }

  const handleAddProject = async (ws: Workspace, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      const folder = await window.api.selectFolder()
      if (!folder) return
      const folderName = folder.replace(/\\/g, '/').split('/').pop() || folder
      await window.api.addProjectToWorkspace(ws.id, { path: folder, name: folderName })
      await loadWorkspaces()
      showToast(t('toast.projectAdded', 'Added "{{name}}" to workspace', { name: folderName }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handleRemoveProject = async (ws: Workspace, projectPath: string, projectName: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!confirm(t('workspace.confirmRemoveProject', 'Remove "{{name}}" from workspace?', { name: projectName }))) return
    try {
      await window.api.removeProjectFromWorkspace(ws.id, projectPath)
      await loadWorkspaces()
      showToast(t('toast.projectRemoved', 'Removed "{{name}}" from workspace', { name: projectName }), 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const isProjectInvalid = (wsId: string, projectPath: string): boolean =>
    invalidProjects.some(ip => ip.workspaceId === wsId && ip.projectPath === projectPath)

  const hasAnyInvalidProject = (wsId: string): boolean =>
    invalidProjects.some(ip => ip.workspaceId === wsId)

  const handleRelinkProject = async (ws: Workspace, oldPath: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      const newPath = await window.api.selectFolder()
      if (!newPath) return
      // Remove old, add new
      await window.api.removeProjectFromWorkspace(ws.id, oldPath)
      const folderName = newPath.replace(/\\/g, '/').split('/').pop() || newPath
      await window.api.addProjectToWorkspace(ws.id, { path: newPath, name: folderName })
      setInvalidProjects(invalidProjects.filter(ip => !(ip.workspaceId === ws.id && ip.projectPath === oldPath)))
      await loadWorkspaces()
      showToast(t('toast.projectRelinked', 'Project path updated'), 'success')
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
            <span className="text-[10px] text-muted-foreground shrink-0">
              {t('workspace.projectCount', '{{count}} project(s)', { count: activeWorkspace.projects?.length ?? 0 })}
            </span>
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
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-[70vh] overflow-y-auto">
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
              {workspaces.map((ws) => {
                const isExpanded = expandedIds.has(ws.id)
                const projectCount = ws.projects?.length ?? 0
                return (
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
                    <>
                      <div className="group flex items-center">
                        {/* Expand toggle */}
                        <button
                          onClick={(e) => toggleExpanded(ws.id, e)}
                          className="p-1 ml-1 rounded hover:bg-accent/50 text-muted-foreground shrink-0"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        {/* Workspace select */}
                        <button
                          onClick={() => handleSelect(ws.id)}
                          className={cn(
                            'flex items-center gap-2 flex-1 px-2 py-2 text-sm hover:bg-muted/50 transition-colors',
                            activeWorkspaceId === ws.id && 'bg-primary/10'
                          )}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: ws.color }}
                          />
                          <span className="truncate flex-1 text-left">{ws.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {projectCount}
                          </span>
                          {hasAnyInvalidProject(ws.id) && (
                            <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                          )}
                          {ws.connectionType === 'ssh' && (
                            <Server size={12} className="text-muted-foreground" />
                          )}
                        </button>
                        {/* Edit / Delete */}
                        <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
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

                      {/* Expanded project list */}
                      {isExpanded && (
                        <div className="ml-5 mr-1 mb-1">
                          {ws.projects && ws.projects.length > 0 ? (
                            ws.projects.map((proj) => {
                              const invalid = isProjectInvalid(ws.id, proj.path)
                              return (
                                <div key={proj.path} className="group/proj flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/30 text-[11px]">
                                  <FolderOpen size={11} className={cn('shrink-0', invalid ? 'text-amber-400' : 'text-muted-foreground')} />
                                  <span className={cn('truncate flex-1', invalid && 'text-amber-400 line-through')} title={proj.path}>
                                    {proj.name}
                                  </span>
                                  {invalid && (
                                    <button
                                      onClick={(e) => handleRelinkProject(ws, proj.path, e)}
                                      className="p-0.5 rounded hover:bg-accent text-amber-400 opacity-0 group-hover/proj:opacity-100 transition-opacity"
                                      title={t('workspace.projectPathInvalid', 'Project folder not found')}
                                    >
                                      <FolderOpen size={10} />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => handleRemoveProject(ws, proj.path, proj.name, e)}
                                    className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-red-400 opacity-0 group-hover/proj:opacity-100 transition-opacity shrink-0"
                                    title={t('workspace.removeProject', 'Remove Project')}
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              )
                            })
                          ) : (
                            <div className="text-[10px] text-muted-foreground px-2 py-1">
                              {t('workspace.noProjects', 'No projects yet')}
                            </div>
                          )}
                          <button
                            onClick={(e) => handleAddProject(ws, e)}
                            className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30 rounded transition-colors"
                          >
                            <Plus size={11} />
                            <span>{t('workspace.addProject', 'Add Project')}</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )})}
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
