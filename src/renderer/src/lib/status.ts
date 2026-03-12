import type { AgentStatus } from '@shared/types'

interface StatusStyle {
  dot: string
  badge: string
  badgeText: string
}

const statusStyles: Record<AgentStatus, StatusStyle> = {
  creating: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/15',
    badgeText: 'text-gray-600 dark:text-gray-400'
  },
  active: {
    dot: 'bg-green-500',
    badge: 'bg-green-500/15',
    badgeText: 'text-green-700 dark:text-green-400'
  },
  thinking: {
    dot: 'bg-blue-500 animate-pulse',
    badge: 'bg-blue-500/15',
    badgeText: 'text-blue-700 dark:text-blue-400'
  },
  tool_running: {
    dot: 'bg-yellow-500 animate-pulse',
    badge: 'bg-yellow-500/15',
    badgeText: 'text-yellow-700 dark:text-yellow-400'
  },
  awaiting: {
    dot: 'bg-orange-500 animate-bounce',
    badge: 'bg-orange-500/15',
    badgeText: 'text-orange-700 dark:text-orange-400'
  },
  error: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/15',
    badgeText: 'text-red-700 dark:text-red-400'
  },
  session_conflict: {
    dot: 'bg-purple-500 animate-pulse',
    badge: 'bg-purple-500/15',
    badgeText: 'text-purple-700 dark:text-purple-400'
  },
  idle: {
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/15',
    badgeText: 'text-gray-600 dark:text-gray-400'
  },
  archived: {
    dot: 'bg-gray-300 dark:bg-gray-600',
    badge: 'bg-gray-500/15',
    badgeText: 'text-gray-500 dark:text-gray-500'
  }
}

export function getStatusDot(status: AgentStatus): string {
  return statusStyles[status].dot
}

export function getStatusBadge(status: AgentStatus): { className: string; label: string } {
  const style = statusStyles[status]
  const labels: Record<AgentStatus, string> = {
    creating: 'Starting',
    active: 'Ready',
    thinking: 'Thinking',
    tool_running: 'Running',
    awaiting: 'Awaiting',
    error: 'Error',
    session_conflict: 'In Use',
    idle: 'Idle',
    archived: 'Archived'
  }
  return {
    className: `${style.badge} ${style.badgeText}`,
    label: labels[status]
  }
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
