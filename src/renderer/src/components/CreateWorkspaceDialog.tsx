import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { showToast } from './ToastContainer'
import { X, Laptop, Server, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'

interface CreateWorkspaceDialogProps {
  onClose: () => void
}

const COLORS = ['#748ffc', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444']

export function CreateWorkspaceDialog({ onClose }: CreateWorkspaceDialogProps): JSX.Element {
  const { t } = useTranslation()
  const { setActiveWorkspaceId } = useAppStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#748ffc')
  const [connectionType, setConnectionType] = useState<'local' | 'ssh'>('local')
  const [sshHost, setSshHost] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshUsername, setSshUsername] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleTestConnection = useCallback(async () => {
    if (!sshHost || !sshUsername) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.testSshConnection({
        host: sshHost,
        port: parseInt(sshPort) || 22,
        username: sshUsername,
        privateKeyPath: sshKeyPath || undefined
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }, [sshHost, sshPort, sshUsername, sshKeyPath])

  const handleSelectKey = useCallback(async () => {
    const path = await window.api.selectFolder()
    if (path) setSshKeyPath(path)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const ws = await window.api.createWorkspace({
        name: name.trim(),
        color,
        connectionType,
        sshConfig: connectionType === 'ssh' ? {
          host: sshHost,
          port: parseInt(sshPort) || 22,
          username: sshUsername,
          privateKeyPath: sshKeyPath || undefined
        } : undefined
      })
      await window.api.setActiveWorkspace(ws.id)
      setActiveWorkspaceId(ws.id)
      showToast(`Workspace "${ws.name}" created`, 'success')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [name, color, connectionType, sshHost, sshPort, sshUsername, sshKeyPath, setActiveWorkspaceId, onClose])

  const canCreate = name.trim() && (connectionType === 'local' || (sshHost && sshUsername))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[520px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">{t('workspace.create')}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name + Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Company-A, Personal"
                className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm outline-none"
                autoFocus
              />
              <div className="flex gap-0.5 items-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn('w-5 h-5 rounded-full border-2 transition-transform', color === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Connection Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Connection</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setConnectionType('local')}
                className={cn(
                  'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors',
                  connectionType === 'local' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                )}
              >
                <Laptop size={16} />
                <div className="text-left">
                  <div className="font-medium">Local</div>
                  <div className="text-[10px] text-muted-foreground">Run on this machine</div>
                </div>
              </button>
              <button
                onClick={() => setConnectionType('ssh')}
                className={cn(
                  'flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors',
                  connectionType === 'ssh' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                )}
              >
                <Server size={16} />
                <div className="text-left">
                  <div className="font-medium">SSH Remote</div>
                  <div className="text-[10px] text-muted-foreground">Connect via SSH + tmux</div>
                </div>
              </button>
            </div>
          </div>

          {/* SSH Config */}
          {connectionType === 'ssh' && (
            <div className="space-y-3 p-3 bg-secondary/50 rounded-lg border border-border/50">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-medium text-muted-foreground">Host</label>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full mt-0.5 px-2 py-1.5 bg-background rounded text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Port</label>
                  <input
                    type="text"
                    value={sshPort}
                    onChange={(e) => setSshPort(e.target.value)}
                    placeholder="22"
                    className="w-full mt-0.5 px-2 py-1.5 bg-background rounded text-xs outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Username</label>
                <input
                  type="text"
                  value={sshUsername}
                  onChange={(e) => setSshUsername(e.target.value)}
                  placeholder="user"
                  className="w-full mt-0.5 px-2 py-1.5 bg-background rounded text-xs outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Private Key (optional)</label>
                <div className="flex gap-2 mt-0.5">
                  <input
                    type="text"
                    value={sshKeyPath}
                    onChange={(e) => setSshKeyPath(e.target.value)}
                    placeholder="~/.ssh/id_rsa"
                    className="flex-1 px-2 py-1.5 bg-background rounded text-xs outline-none"
                  />
                  <button onClick={handleSelectKey} className="px-2 py-1.5 bg-background rounded text-xs hover:bg-accent transition-colors">
                    Browse
                  </button>
                </div>
              </div>

              {/* Test Connection */}
              <button
                onClick={handleTestConnection}
                disabled={testing || !sshHost || !sshUsername}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {testing ? (
                  <><Loader2 size={12} className="animate-spin" /> Testing...</>
                ) : (
                  'Test Connection'
                )}
              </button>

              {testResult && (
                <div className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-[10px]',
                  testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                )}>
                  {testResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {testResult.message}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || loading}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? t('common.loading') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
