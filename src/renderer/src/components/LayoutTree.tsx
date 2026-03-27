import { Group, Panel } from 'react-resizable-panels'
import { ResizeHandle } from '@components/ResizeHandle'
import { LeafPane } from '@components/LeafPane'
import { Dashboard } from '@components/Dashboard'
import { useAppStore } from '@stores/useAppStore'
import type { LayoutNode } from '@appTypes/layout'

interface LayoutTreeProps {
  onOpenScanner?: () => void
}

export function LayoutTree({ onOpenScanner }: LayoutTreeProps): JSX.Element {
  const { layoutTree, selectedAgentId } = useAppStore()

  // If no agent selected, show dashboard
  if (!selectedAgentId) {
    return (
      <div className="flex-1 min-w-0 overflow-hidden h-full">
        <Dashboard fullHeight onOpenScanner={onOpenScanner} />
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden h-full">
      <LayoutNodeRenderer node={layoutTree} />
    </div>
  )
}

function LayoutNodeRenderer({ node }: { node: LayoutNode }): JSX.Element {
  if (node.type === 'leaf') {
    return <LeafPane leafId={node.id} agentId={node.agentId} />
  }

  const orientation = node.direction === 'horizontal' ? 'horizontal' : 'vertical'

  return (
    <Group orientation={orientation} className="h-full">
      {node.children.map((child, i) => (
        <LayoutPanelEntry
          key={child.id}
          child={child}
          index={i}
          size={node.sizes[i]}
          isLast={i === node.children.length - 1}
          direction={node.direction}
        />
      ))}
    </Group>
  )
}

interface LayoutPanelEntryProps {
  child: LayoutNode
  index: number
  size: number
  isLast: boolean
  direction: 'horizontal' | 'vertical'
}

function LayoutPanelEntry({ child, size, isLast, direction }: LayoutPanelEntryProps): JSX.Element {
  return (
    <>
      <Panel
        id={child.id}
        defaultSize={`${size}%`}
        minSize={direction === 'horizontal' ? 120 : 80}
      >
        <LayoutNodeRenderer node={child} />
      </Panel>
      {!isLast && (
        <ResizeHandle direction={direction} />
      )}
    </>
  )
}
