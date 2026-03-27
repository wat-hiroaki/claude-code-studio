import { useCallback, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core'
import { useAppStore } from '@stores/useAppStore'
import { getDropPosition, dropToSplit } from '@appTypes/layout'
import type { DropPosition } from '@appTypes/layout'

interface DndProviderProps {
  children: React.ReactNode
}

interface DragData {
  agentId: string
  agentName: string
  fromLeafId?: string
}

export function DndProvider({ children }: DndProviderProps): JSX.Element {
  const [dragData, setDragData] = useState<DragData | null>(null)
  const lastOverId = useRef<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; agentId: string; agentName: string; leafId?: string } | undefined
    if (!data) return
    setDragData({
      agentId: data.agentId,
      agentName: data.agentName,
      fromLeafId: data.leafId
    })
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined
    if (!overId || !overId.startsWith('leaf-')) {
      lastOverId.current = null
      return
    }
    lastOverId.current = overId
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const data = dragData
    setDragData(null)
    lastOverId.current = null

    if (!data || !event.over) return

    const overId = event.over.id as string
    if (!overId.startsWith('leaf-')) return

    const targetLeafId = overId.replace('leaf-', '')
    const overData = event.over.data.current as { type: string; leafId: string } | undefined
    if (!overData) return

    const store = useAppStore.getState()

    // Determine drop position from the final mouse coordinates
    let dropPos: DropPosition = 'center'

    if (event.activatorEvent instanceof PointerEvent) {
      const el = document.querySelector(`[data-leaf-id="${targetLeafId}"]`) as HTMLElement | null
      if (el) {
        const rect = el.getBoundingClientRect()
        const clientX = event.activatorEvent.clientX + (event.delta?.x || 0)
        const clientY = event.activatorEvent.clientY + (event.delta?.y || 0)
        dropPos = getDropPosition(rect, clientX, clientY)
      }
    }

    // Handle the drop
    if (data.fromLeafId) {
      if (data.fromLeafId === targetLeafId) return
      store.moveAgent(data.fromLeafId, targetLeafId, dropPos)
    } else {
      // Dropping from sidebar
      const targetLeaf = (() => {
        const find = (node: import('../types/layout').LayoutNode): import('../types/layout').LayoutLeaf | null => {
          if (node.type === 'leaf' && node.id === targetLeafId) return node
          if (node.type === 'split') {
            for (const child of node.children) {
              const found = find(child)
              if (found) return found
            }
          }
          return null
        }
        return find(store.layoutTree)
      })()

      if (!targetLeaf) return

      const splitInfo = dropToSplit(dropPos)
      if (splitInfo) {
        store.splitPane(targetLeafId, splitInfo.direction, data.agentId, splitInfo.position)
      } else {
        store.setLeafAgent(targetLeafId, data.agentId)
      }
    }
  }, [dragData])

  const handleDragCancel = useCallback(() => {
    setDragData(null)
    lastOverId.current = null
  }, [])

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragData && (
          <div className="px-3 py-2 rounded-lg bg-card border border-primary/40 shadow-lg shadow-primary/10 text-sm font-medium text-foreground flex items-center gap-2 pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-primary" />
            {dragData.agentName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
