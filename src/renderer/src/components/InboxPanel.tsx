import { useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { cn } from '@lib/utils'
import {
  Inbox,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Check,
  X,
  RotateCcw,
  Loader2
} from 'lucide-react'
import type { Agent, AgentStatus, Message } from '@shared/types'

interface InboxPanelProps {
  onSelectAgent: (agentId: string) => void
}

type InboxItemCategory = 'awaiting' | 'error' | 'completed' | 'working'

interface InboxItem {
  agent: Agent
  category: InboxItemCategory
  lastMessage: Message | null
  timestamp: string
}

const categoryOrder: Record<InboxItemCategory, number> = {
  awaiting: 0,
  error: 1,
  completed: 2,
  working: 3
}

const statusToCategory: Partial<Record<AgentStatus, InboxItemCategory>> = {
  awaiting: 'awaiting',
  error: 'error',
  idle: 'completed',
  active: 'working',
  thinking: 'working',
  tool_running: 'working'
}

const categoryIndicatorColors: Record<InboxItemCategory, string> = {
  awaiting: 'bg-yellow-500',
  error: 'bg-red-500',
  completed: 'bg-green-500',
  working: 'bg-blue-500'
}

const categoryIcons: Record<InboxItemCategory, typeof AlertCircle> = {
  awaiting: Clock,
  error: AlertCircle,
  completed: CheckCircle2,
  working: Loader2
}

export function InboxPanel({ onSelectAgent }: InboxPanelProps): JSX.Element {
  const { t } = useTranslation()
  const { agents, messages } = useAppStore()

  const inboxItems = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = []

    for (const agent of agents) {
      const category = statusToCategory[agent.status]
      if (!category) continue

      const agentMessages = messages[agent.id] ?? []
      const lastMessage = agentMessages.length > 0 ? agentMessages[agentMessages.length - 1] : null

      items.push({
        agent,
        category,
        lastMessage,
        timestamp: lastMessage?.createdAt ?? agent.updatedAt
      })
    }

    items.sort((a, b) => {
      const catDiff = categoryOrder[a.category] - categoryOrder[b.category]
      if (catDiff !== 0) return catDiff
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })

    return items
  }, [agents, messages])

  const attentionCount = useMemo(() => {
    return inboxItems.filter((i) => i.category === 'awaiting' || i.category === 'error').length
  }, [inboxItems])

  const handleApprove = useCallback(
    (agentId: string) => {
      window.api.sendMessage(agentId, 'yes')
    },
    []
  )

  const handleReject = useCallback(
    (agentId: string) => {
      window.api.sendMessage(agentId, 'no')
    },
    []
  )

  const handleRestart = useCallback(
    (agentId: string) => {
      window.api.restartAgent(agentId)
    },
    []
  )

  const formatTime = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getMessagePreview = (item: InboxItem): string => {
    if (!item.lastMessage) return ''
    const content = item.lastMessage.content
    if (content.length > 80) return content.slice(0, 80) + '...'
    return content
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-primary" />
          <span className="text-sm font-semibold">{t('inbox.title')}</span>
          {attentionCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
              {attentionCount}
            </span>
          )}
        </div>
        {attentionCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t('inbox.needsAttention')}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {agents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
            <Inbox size={32} className="text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">{t('inbox.empty')}</p>
          </div>
        )}

        {/* All clear state */}
        {agents.length > 0 && attentionCount === 0 && inboxItems.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border-b border-border">
            <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
            <span className="text-xs text-green-600 dark:text-green-400">
              {t('inbox.allClear')}
            </span>
          </div>
        )}

        {/* Items */}
        {inboxItems.map((item) => {
          const CategoryIcon = categoryIcons[item.category]
          return (
            <div
              key={item.agent.id}
              className="border-b border-border/50 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3 px-4 py-3">
                {/* Status indicator */}
                <div className="flex-shrink-0 mt-1">
                  <div
                    className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      categoryIndicatorColors[item.category],
                      item.category === 'working' && 'animate-pulse'
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold truncate">
                      {item.agent.name}
                    </span>
                    {item.agent.roleLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0">
                        {item.agent.roleLabel}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CategoryIcon
                      size={11}
                      className={cn(
                        item.category === 'awaiting' && 'text-yellow-500',
                        item.category === 'error' && 'text-red-500',
                        item.category === 'completed' && 'text-green-500',
                        item.category === 'working' && 'text-blue-500 animate-spin'
                      )}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {t(`agent.status.${item.agent.status}`)}
                    </span>
                  </div>

                  {/* Message preview */}
                  {item.lastMessage && (
                    <p className="text-[11px] text-muted-foreground truncate mt-1">
                      {getMessagePreview(item)}
                    </p>
                  )}

                  {/* Project name */}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {item.agent.projectName}
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {item.category === 'awaiting' && (
                      <>
                        <button
                          onClick={() => handleApprove(item.agent.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                        >
                          <Check size={10} />
                          {t('inbox.approve')}
                        </button>
                        <button
                          onClick={() => handleReject(item.agent.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          <X size={10} />
                          {t('inbox.reject')}
                        </button>
                        <button
                          onClick={() => onSelectAgent(item.agent.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                        >
                          <ExternalLink size={10} />
                          {t('inbox.open')}
                        </button>
                      </>
                    )}

                    {item.category === 'error' && (
                      <>
                        <button
                          onClick={() => onSelectAgent(item.agent.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                        >
                          <ExternalLink size={10} />
                          {t('inbox.open')}
                        </button>
                        <button
                          onClick={() => handleRestart(item.agent.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-orange-600 hover:bg-orange-700 text-white transition-colors"
                        >
                          <RotateCcw size={10} />
                          {t('inbox.restart')}
                        </button>
                      </>
                    )}

                    {item.category === 'completed' && (
                      <button
                        onClick={() => onSelectAgent(item.agent.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                      >
                        <ExternalLink size={10} />
                        {t('inbox.open')}
                      </button>
                    )}

                    {item.category === 'working' && (
                      <button
                        onClick={() => onSelectAgent(item.agent.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                      >
                        <ExternalLink size={10} />
                        {t('inbox.open')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
