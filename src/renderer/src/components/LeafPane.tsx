import { useRef, useState, useCallback, useEffect } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { TerminalView } from '@components/TerminalView'
import { PtyTerminalView } from '@components/PtyTerminalView'
import { cn } from '@lib/utils'
import { X, GripVertical, Save, BookOpen, Brain } from 'lucide-react'
import type { DropPosition } from '@appTypes/layout'
import { getDropPosition, countLeaves, getAllAgentIds } from '@appTypes/layout'
import type { PluginToolbarButton } from '@shared/types'

const ICON_MAP: Record<string, typeof Save> = { save: Save, 'book-open': BookOpen, brain: Brain }

interface LeafPaneProps {
  leafId: string
  agentId: string | null
}

export function LeafPane({ leafId, agentId }: LeafPaneProps): JSX.Element {
  const { t } = useTranslation()
  const {
    selectedAgentId,
    setSelectedAgent,
    removeLeaf,
    setLeafAgent,
    agents,
    usePtyMode,
    layoutTree
  } = useAppStore()

  const paneRef = useRef<HTMLDivElement>(null)
  const [dropZone, setDropZone] = useState<DropPosition | null>(null)
  const [pluginButtons, setPluginButtons] = useState<PluginToolbarButton[]>([])

  useEffect(() => {
    window.api.pluginToolbarButtons().then(setPluginButtons).catch(() => {})
  }, [])
  const leafCount = countLeaves(layoutTree)
  const compact = leafCount >= 4
  const agentName = agents.find(a => a.id === agentId)?.name || ''

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `leaf-${leafId}`,
    data: { type: 'leaf', leafId }
  })

  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `pane-${leafId}`,
    data: {
      type: 'pane-agent',
      agentId,
      agentName,
      leafId
    },
    disabled: !agentId
  })

  // Track mouse position for drop zone detection during drag
  const handleDragOver = useCallback((e: React.DragEvent | React.MouseEvent) => {
    if (!paneRef.current || !active) return
    const rect = paneRef.current.getBoundingClientRect()
    const pos = getDropPosition(rect, e.clientX, e.clientY)
    setDropZone(pos)
  }, [active])

  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setDropRef(node)
    ;(paneRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [setDropRef])

  // Empty pane
  if (!agentId) {
    return (
      <div
        ref={combinedRef}
        data-leaf-id={leafId}
        className={cn(
          'flex flex-col h-full items-center justify-center bg-card text-muted-foreground gap-3 transition-colors',
          isOver && 'bg-primary/5 ring-2 ring-primary/30 ring-inset'
        )}
        onMouseMove={handleDragOver}
      >
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <GripVertical size={24} className="text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/60">
            {t('pane.dropHere', 'Drop agent here')}
          </p>
        </div>

        {/* Quick assign buttons for empty pane */}
        {(() => {
          const assignedIds = new Set(getAllAgentIds(layoutTree))
          const available = agents.filter(a => a.status !== 'archived' && !assignedIds.has(a.id))
          if (available.length === 0) return null
          return (
            <div className="flex flex-wrap gap-1 max-w-[240px] justify-center mt-1">
              {available.map(a => (
                <button
                  key={a.id}
                  onClick={() => setLeafAgent(leafId, a.id)}
                  className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors flex flex-col items-center"
                  title={a.workspaceId || undefined}
                >
                  <span>{a.name}</span>
                  {a.workspaceId && (
                    <span className="text-[8px] text-muted-foreground/60">
                      {a.workspaceId.split('/').pop()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div
      ref={combinedRef}
      data-leaf-id={leafId}
      className={cn(
        'flex flex-col h-full overflow-hidden relative transition-[box-shadow] duration-150',
        selectedAgentId === agentId && 'ring-1 ring-primary/40'
      )}
      onMouseEnter={() => {
        if (agentId && selectedAgentId !== agentId) {
          setSelectedAgent(agentId, false)
        }
      }}
      onMouseMove={handleDragOver}
    >
      {/* Pane toolbar */}
      <div
        ref={setDragRef}
        {...dragListeners}
        {...dragAttributes}
        className={cn(
          'flex items-center justify-between px-2 py-0.5 bg-card/80 border-b border-border/40 cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-40'
        )}
        data-drag-handle={leafId}
      >
        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
          {agentName}
        </span>
        <div className="flex items-center gap-0.5">
          {pluginButtons.map(btn => {
            const Icon = ICON_MAP[btn.icon] || Save
            return (
              <button
                key={btn.id}
                onClick={async () => {
                  if (!agentId) return
                  const agentData = agents.find(a => a.id === agentId)
                  const project = agentData?.name || ''
                  const cmd = btn.prompt.replace('{project}', project)
                  try {
                    await window.api.ptyWrite(agentId, cmd + '\r')
                  } catch { /* ignore */ }
                }}
                className="p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                title={btn.tool}
              >
                <Icon size={10} />
              </button>
            )
          })}
          <button
            onClick={() => removeLeaf(leafId)}
            className="text-[10px] px-1.5 py-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title={t('common.close', 'Close')}
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {usePtyMode ? (
          <PtyTerminalView
            key={agentId}
            agentId={agentId}
            compact={compact}
          />
        ) : (
          <TerminalView
            key={agentId}
            agentId={agentId}
            compact={compact}
            onClose={() => removeLeaf(leafId)}
          />
        )}
      </div>

      {/* Drop zone overlay — only visible during drag */}
      {isOver && active && (
        <DropZoneOverlay position={dropZone} />
      )}
    </div>
  )
}

function DropZoneOverlay({ position }: { position: DropPosition | null }): JSX.Element {
  if (!position) return <></>

  const baseClasses = 'absolute pointer-events-none transition-all duration-100'

  const zoneStyles: Record<DropPosition, string> = {
    top: `${baseClasses} inset-x-0 top-0 h-1/4 bg-primary/15 border-b-2 border-primary/40`,
    bottom: `${baseClasses} inset-x-0 bottom-0 h-1/4 bg-primary/15 border-t-2 border-primary/40`,
    left: `${baseClasses} inset-y-0 left-0 w-1/4 bg-primary/15 border-r-2 border-primary/40`,
    right: `${baseClasses} inset-y-0 right-0 w-1/4 bg-primary/15 border-l-2 border-primary/40`,
    center: `${baseClasses} inset-0 bg-primary/10 border-2 border-primary/30 border-dashed`
  }

  return <div className={zoneStyles[position]} />
}
