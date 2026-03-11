import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Agent, AgentStatus } from '@shared/types'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { Pin, PinOff, RotateCw, Archive } from 'lucide-react'

const statusColors: Record<AgentStatus, string> = {
  creating: 'bg-gray-400',
  active: 'bg-green-500',
  thinking: 'bg-blue-500 animate-pulse',
  tool_running: 'bg-yellow-500',
  awaiting: 'bg-orange-500',
  error: 'bg-red-500',
  idle: 'bg-gray-400',
  archived: 'bg-gray-300'
}

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps): JSX.Element {
  const { t } = useTranslation()
  const { updateAgentInList } = useAppStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu])

  const handlePin = async (): Promise<void> => {
    await window.api.updateAgent(agent.id, { isPinned: !agent.isPinned })
    updateAgentInList(agent.id, { isPinned: !agent.isPinned })
    setContextMenu(null)
  }

  const handleRestart = async (): Promise<void> => {
    await window.api.restartAgent(agent.id)
    setContextMenu(null)
  }

  const handleArchive = async (): Promise<void> => {
    await window.api.archiveAgent(agent.id)
    setContextMenu(null)
  }

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-accent/50',
          isSelected && 'bg-accent'
        )}
      >
        {/* Avatar with status dot */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
            {initials}
          </div>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
              statusColors[agent.status]
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{agent.name}</span>
            {agent.roleLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {agent.roleLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {agent.currentTask || t(`agent.status.${agent.status}`)}
          </p>
        </div>

        {/* Badges */}
        <div className="flex flex-col items-end gap-1">
          {agent.isPinned && (
            <Pin size={10} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handlePin}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            {agent.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
            {agent.isPinned ? t('agent.actions.unpin') : t('agent.actions.pin')}
          </button>
          <button
            onClick={handleRestart}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            <RotateCw size={12} />
            {t('agent.actions.restart')}
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={handleArchive}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-accent transition-colors"
          >
            <Archive size={12} />
            {t('agent.actions.archive')}
          </button>
        </div>
      )}
    </>
  )
}
