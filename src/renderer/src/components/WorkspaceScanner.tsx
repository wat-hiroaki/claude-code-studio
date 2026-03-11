import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Search, FolderOpen, FileText, FolderCog, Users, Package, ChevronRight, Loader2, HardDrive } from 'lucide-react'
import { cn } from '../lib/utils'
import type { DiscoveredWorkspace } from '@shared/types'

interface WorkspaceScannerProps {
  onClose: () => void
  onCreateAgent?: (workspace: DiscoveredWorkspace) => void
}

export function WorkspaceScanner({ onClose, onCreateAgent }: WorkspaceScannerProps): JSX.Element {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<DiscoveredWorkspace[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [scanRoot, setScanRoot] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSelectRoot = async (): Promise<void> => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setScanRoot(folder)
    }
  }

  const handleScan = async (): Promise<void> => {
    if (!scanRoot.trim()) return
    setScanning(true)
    setWorkspaces([])
    setExpandedPath(null)
    try {
      const results = await window.api.scanWorkspaces(scanRoot.trim())
      setWorkspaces(results)
      setScanned(true)
    } catch {
      setWorkspaces([])
    } finally {
      setScanning(false)
    }
  }

  const handleScanHome = async (): Promise<void> => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setScanRoot(folder)
      setScanning(true)
      setWorkspaces([])
      setExpandedPath(null)
      try {
        const results = await window.api.scanWorkspaces(folder)
        setWorkspaces(results)
        setScanned(true)
      } catch {
        setWorkspaces([])
      } finally {
        setScanning(false)
      }
    }
  }

  const fileIcons: Record<string, { icon: typeof FileText; label: string; color: string }> = {
    claudeMd: { icon: FileText, label: 'CLAUDE.md', color: 'text-orange-500' },
    claudeDir: { icon: FolderCog, label: '.claude/', color: 'text-blue-500' },
    agentsMd: { icon: Users, label: 'AGENTS.md', color: 'text-purple-500' },
    packageJson: { icon: Package, label: 'package.json', color: 'text-green-500' }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[640px] max-h-[80vh] overflow-hidden shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-primary" />
            <h3 className="font-semibold">{t('workspace.title')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        {/* Scan Controls */}
        <div className="p-4 border-b border-border space-y-3">
          <p className="text-xs text-muted-foreground">{t('workspace.description')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={scanRoot}
              onChange={(e) => setScanRoot(e.target.value)}
              placeholder={t('workspace.rootPlaceholder')}
              className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
            />
            <button
              onClick={handleSelectRoot}
              className="px-3 py-2 bg-secondary rounded-lg hover:bg-accent transition-colors"
              title="Browse..."
            >
              <FolderOpen size={16} />
            </button>
            <button
              onClick={handleScan}
              disabled={!scanRoot.trim() || scanning}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {t('workspace.scan')}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {scanning && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('workspace.scanning')}</p>
            </div>
          )}

          {!scanning && scanned && workspaces.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">
              {t('workspace.noResults')}
            </div>
          )}

          {!scanning && !scanned && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <HardDrive size={32} className="text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t('workspace.hint')}</p>
              <button
                onClick={handleScanHome}
                className="text-xs text-primary hover:underline"
              >
                {t('workspace.scanFromFolder')}
              </button>
            </div>
          )}

          {!scanning && workspaces.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground mb-3">
                {t('workspace.found', { count: workspaces.length })}
              </div>
              {workspaces.map((ws) => {
                const isExpanded = expandedPath === ws.path
                return (
                  <div
                    key={ws.path}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    {/* Workspace card header */}
                    <button
                      onClick={() => setExpandedPath(isExpanded ? null : ws.path)}
                      className="w-full text-left p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          size={14}
                          className={cn(
                            'text-muted-foreground transition-transform flex-shrink-0',
                            isExpanded && 'rotate-90'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{ws.name}</span>
                            {ws.detectedFiles.agentsMd && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                AGENTS
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {ws.path}
                          </div>
                        </div>
                        {/* Detected file badges */}
                        <div className="flex gap-1 flex-shrink-0">
                          {(Object.entries(ws.detectedFiles) as [string, boolean][])
                            .filter(([, v]) => v)
                            .map(([key]) => {
                              const info = fileIcons[key]
                              if (!info) return null
                              const Icon = info.icon
                              return (
                                <div
                                  key={key}
                                  title={info.label}
                                  className={cn('p-1 rounded', info.color)}
                                >
                                  <Icon size={12} />
                                </div>
                              )
                            })}
                        </div>
                      </div>

                      {/* Tech stack tags */}
                      {ws.techStack.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 ml-7">
                          {ws.techStack.map((tech) => (
                            <span
                              key={tech}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-border p-3 bg-secondary/30 space-y-3">
                        {ws.claudeMdPreview && (
                          <div>
                            <div className="text-[10px] font-medium text-muted-foreground mb-1">
                              CLAUDE.md {t('workspace.preview')}
                            </div>
                            <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap bg-secondary rounded p-2 max-h-[120px] overflow-y-auto">
                              {ws.claudeMdPreview}
                            </pre>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <div className="text-[10px] text-muted-foreground">
                            {t('workspace.detectedFiles')}:
                            {' '}
                            {(Object.entries(ws.detectedFiles) as [string, boolean][])
                              .filter(([, v]) => v)
                              .map(([key]) => fileIcons[key]?.label)
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        </div>

                        {onCreateAgent && (
                          <button
                            onClick={() => onCreateAgent(ws)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            {t('workspace.createAgent')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
