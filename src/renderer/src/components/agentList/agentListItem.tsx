import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { AgentAvatar } from '@components/AgentAvatar'
import { DraggableAgent } from '@components/DraggableAgent'
import { cn } from '@lib/utils'
import { getStatusDot } from '@lib/status'
import { formatTime, stripAnsi } from './useAgentListGroups'
import type { Agent } from '@shared/types'

interface AgentListItemProps {
  agent: Agent
  onContextMenu: (e: React.MouseEvent, agentId: string) => void
}

export function AgentListItem({ agent, onContextMenu }: AgentListItemProps): JSX.Element {
  const { t } = useTranslation()
  const { selectedAgentId, setSelectedAgent, messages } = useAppStore()

  const getLastActivity = (a: Agent): { preview: string; time: string | null } => {
    const agentMsgs = messages[a.id] ?? []
    const lastMsg = agentMsgs[agentMsgs.length - 1]
    if (lastMsg) {
      const raw =
        lastMsg.role === 'manager' ? `You: ${lastMsg.content}` : lastMsg.content
      return { preview: stripAnsi(raw), time: lastMsg.createdAt }
    }
    return { preview: t(`agent.status.${a.status}`), time: a.updatedAt }
  }

  const { preview, time } = getLastActivity(agent)

  return (
    <DraggableAgent agentId={agent.id} agentName={agent.name}>
      <button
        onClick={() => setSelectedAgent(agent.id)}
        onContextMenu={(e) => onContextMenu(e, agent.id)}
        className={cn(
          'w-full flex items-center gap-2 pl-7 pr-2.5 py-1.5 text-left transition-colors hover:bg-accent/50',
          selectedAgentId === agent.id && 'bg-accent'
        )}
      >
        {/* Avatar + status dot */}
        <div className="relative flex-shrink-0">
          <AgentAvatar agent={agent} size="md" />
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
              getStatusDot(agent.status)
            )}
          />
        </div>

        {/* Name + preview + time */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium truncate">
              {agent.name}
            </span>
            {time && (
              <span className="text-[9px] text-muted-foreground shrink-0 ml-1">
                {formatTime(time)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {preview}
          </p>
        </div>
      </button>
    </DraggableAgent>
  )
}
