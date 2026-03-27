import { useDraggable } from '@dnd-kit/core'
import { cn } from '@lib/utils'

interface DraggableAgentProps {
  agentId: string
  agentName: string
  children: React.ReactNode
}

export function DraggableAgent({ agentId, agentName, children }: DraggableAgentProps): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `agent-${agentId}`,
    data: {
      type: 'sidebar-agent',
      agentId,
      agentName
    }
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'transition-opacity cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40'
      )}
    >
      {children}
    </div>
  )
}
