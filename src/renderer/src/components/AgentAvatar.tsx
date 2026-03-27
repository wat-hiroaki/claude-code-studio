import { cn } from '@lib/utils'
import { getInitials } from '@lib/status'
import type { Agent } from '@shared/types'

interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'icon'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
}

const sizeMap = {
  xs: { container: 'w-5 h-5', text: 'text-[7px]', emoji: 'text-[10px]' },
  sm: { container: 'w-6 h-6', text: 'text-[9px]', emoji: 'text-[12px]' },
  md: { container: 'w-8 h-8', text: 'text-[11px]', emoji: 'text-[16px]' },
  lg: { container: 'w-10 h-10', text: 'text-[13px]', emoji: 'text-[20px]' }
}

export function AgentAvatar({ agent, size = 'sm', className, onClick }: AgentAvatarProps): JSX.Element {
  const s = sizeMap[size]

  if (agent.icon) {
    return (
      <div
        className={cn(
          s.container,
          'rounded-full flex items-center justify-center shrink-0',
          onClick && 'cursor-pointer hover:ring-1 hover:ring-primary/50',
          className
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        title={agent.name}
      >
        <span className={s.emoji}>{agent.icon}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        s.container,
        'rounded-full bg-primary/10 flex items-center justify-center font-medium shrink-0',
        s.text,
        onClick && 'cursor-pointer hover:ring-1 hover:ring-primary/50',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={agent.name}
    >
      {getInitials(agent.name)}
    </div>
  )
}
