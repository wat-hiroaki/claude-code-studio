import { Separator } from 'react-resizable-panels'
import { cn } from '@lib/utils'

interface ResizeHandleProps {
  direction?: 'horizontal' | 'vertical'
  className?: string
}

export function ResizeHandle({ direction = 'horizontal', className }: ResizeHandleProps): JSX.Element {
  const isHorizontal = direction === 'horizontal'

  return (
    <Separator
      className={cn(
        'group relative flex items-center justify-center transition-colors',
        isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize',
        'hover:bg-primary/20 active:bg-primary/30',
        className
      )}
    >
      <div
        className={cn(
          'rounded-full bg-border transition-all group-hover:bg-primary/60 group-active:bg-primary',
          isHorizontal ? 'h-8 w-0.5' : 'w-8 h-0.5'
        )}
      />
    </Separator>
  )
}
