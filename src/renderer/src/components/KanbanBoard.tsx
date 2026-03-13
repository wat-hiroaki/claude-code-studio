import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { getInitials } from '../lib/status'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { Task, TaskStatus } from '@shared/types'

const kanbanColumns: { status: TaskStatus; color: string; labelKey: string }[] = [
  { status: 'todo', color: 'border-blue-500', labelKey: 'todo' },
  { status: 'in_progress', color: 'border-orange-500', labelKey: 'in_progress' },
  { status: 'done', color: 'border-green-500', labelKey: 'done' }
]

function SortableTaskCard({ task }: { task: Task }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskKanbanCard task={task} />
    </div>
  )
}

function TaskKanbanCard({ task }: { task: Task }): JSX.Element {
  const { agents } = useAppStore()
  const assignedAgent = task.agentId ? agents.find(a => a.id === task.agentId) : null

  return (
    <div
      className="w-full text-left p-2.5 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors mb-1.5 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{task.title}</div>
          {task.description && (
            <div className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{task.description}</div>
          )}
        </div>
      </div>
      {assignedAgent && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-medium" title={assignedAgent.name}>
            {getInitials(assignedAgent.name)}
          </div>
          <span className="text-[9px] text-muted-foreground truncate">{assignedAgent.name}</span>
        </div>
      )}
    </div>
  )
}

export function KanbanBoard(): JSX.Element {
  const { t } = useTranslation()
  const { tasks, updateTask } = useAppStore()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const targetColumn = over.id as string

    if (kanbanColumns.some((c) => c.status === targetColumn)) {
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.status !== targetColumn) {
        window.api.updateTask(taskId, { status: targetColumn as TaskStatus })
        updateTask(taskId, { status: targetColumn as TaskStatus })
      }
    }
  }

  const draggedTask = activeId ? tasks.find((a) => a.id === activeId) : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {kanbanColumns.map(({ status, color, labelKey }) => {
          const columnTasks = tasks.filter((t) => t.status === status)

          return (
            <div
              key={status}
              id={status}
              className={cn('flex-shrink-0 w-64 rounded-lg bg-secondary/50 border-t-2 flex flex-col', color)}
            >
              <div className="p-2 flex items-center justify-between">
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-background/50">
                  {t(`task.status.${labelKey}`, labelKey.replace('_', ' ').toUpperCase())}
                </span>
                <span className="text-[10px] text-muted-foreground">{columnTasks.length}</span>
              </div>
              <div className="p-1.5 min-h-[80px] flex-1">
                <SortableContext items={columnTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {columnTasks.map((task) => (
                    <SortableTaskCard key={task.id} task={task} />
                  ))}
                </SortableContext>
              </div>
            </div>
          )
        })}
      </div>

      <DragOverlay>
        {draggedTask && <TaskKanbanCard task={draggedTask} />}
      </DragOverlay>
    </DndContext>
  )
}

