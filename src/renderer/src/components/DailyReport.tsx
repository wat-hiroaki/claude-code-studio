import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import {
  X,
  FileText,
  Copy,
  Check,
  Users,
  CheckCircle2,
  XCircle,
  FileCode
} from 'lucide-react'
import type { Agent, Message } from '@shared/types'

interface DailyReportProps {
  onClose: () => void
}

interface AgentSummary {
  agent: Agent
  activities: string[]
  messageCount: number
  errorCount: number
}

export function DailyReport({ onClose }: DailyReportProps): JSX.Element {
  const { t } = useTranslation()
  const { agents } = useAppStore()
  const [agentMessages, setAgentMessages] = useState<Record<string, Message[]>>({})
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const today = useMemo(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  }, [])

  const todayDisplay = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }, [])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    const result: Record<string, Message[]> = {}
    for (const agent of agents) {
      try {
        const messages = await window.api.getMessages(agent.id)
        result[agent.id] = messages
      } catch {
        result[agent.id] = []
      }
    }
    setAgentMessages(result)
    setLoading(false)
  }, [agents])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const filterTodayMessages = useCallback(
    (messages: Message[]): Message[] => {
      return messages.filter((m) => m.createdAt.startsWith(today))
    },
    [today]
  )

  const agentSummaries = useMemo((): AgentSummary[] => {
    return agents.map((agent) => {
      const allMessages = agentMessages[agent.id] ?? []
      const todayMessages = filterTodayMessages(allMessages)

      const activities: string[] = []
      for (const msg of todayMessages) {
        if (msg.role === 'agent' && msg.contentType === 'text') {
          const preview = msg.content.slice(0, 100)
          activities.push(preview + (msg.content.length > 100 ? '...' : ''))
        } else if (msg.contentType === 'tool_exec') {
          const toolName = msg.content.split('\n')[0]?.replace(/[[\]]/g, '') ?? 'tool'
          activities.push(`[${t('profile.tool', 'Tool')}] ${toolName}`)
        }
      }

      const errorCount = todayMessages.filter(
        (m) => m.contentType === 'error'
      ).length

      return {
        agent,
        activities: activities.slice(0, 20),
        messageCount: todayMessages.length,
        errorCount
      }
    })
  }, [agents, agentMessages, filterTodayMessages])

  const totalCompleted = useMemo(() => {
    return agentSummaries.filter(
      (s) => s.agent.status === 'idle' && s.messageCount > 0
    ).length
  }, [agentSummaries])

  const totalErrors = useMemo(() => {
    return agentSummaries.reduce((sum, s) => sum + s.errorCount, 0)
  }, [agentSummaries])

  const changedFiles = useMemo((): string[] => {
    const files: string[] = []
    for (const agent of agents) {
      const messages = agentMessages[agent.id] ?? []
      const todayMessages = filterTodayMessages(messages)
      for (const msg of todayMessages) {
        if (msg.contentType === 'tool_exec' && msg.content.includes('Write')) {
          const lines = msg.content.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (
              trimmed.startsWith('"file_path"') ||
              trimmed.startsWith('"path"')
            ) {
              const match = trimmed.match(/":\s*"([^"]+)"/)
              if (match?.[1]) {
                files.push(match[1])
              }
            }
          }
        }
      }
    }
    return [...new Set(files)]
  }, [agents, agentMessages, filterTodayMessages])

  const generateMarkdown = useCallback((): string => {
    const lines: string[] = []
    lines.push(`# ${t('dailyReport.title')} - ${todayDisplay}`)
    lines.push('')

    // Overview
    lines.push(`## ${t('dailyReport.overview')}`)
    lines.push('')
    lines.push(`| ${t('dailyReport.metric')} | ${t('dailyReport.value')} |`)
    lines.push('|---|---|')
    lines.push(`| ${t('dailyReport.totalAgents')} | ${agents.length} |`)
    lines.push(`| ${t('dailyReport.completedTasks')} | ${totalCompleted} |`)
    lines.push(`| ${t('dailyReport.totalErrors')} | ${totalErrors} |`)
    lines.push('')

    // Per-agent
    lines.push(`## ${t('dailyReport.agentDetails')}`)
    lines.push('')
    for (const summary of agentSummaries) {
      if (summary.messageCount === 0) continue
      lines.push(`### ${summary.agent.name}`)
      lines.push('')
      lines.push(
        `- **${t('dailyReport.status')}**: ${t(`agent.status.${summary.agent.status}`)}`
      )
      lines.push(`- **${t('dailyReport.messages')}**: ${summary.messageCount}`)
      if (summary.errorCount > 0) {
        lines.push(
          `- **${t('dailyReport.errorsCount')}**: ${summary.errorCount}`
        )
      }
      if (summary.activities.length > 0) {
        lines.push('')
        lines.push(`**${t('dailyReport.activities')}:**`)
        for (const activity of summary.activities) {
          lines.push(`- ${activity}`)
        }
      }
      lines.push('')
    }

    // Changed files
    if (changedFiles.length > 0) {
      lines.push(`## ${t('dailyReport.changedFiles')}`)
      lines.push('')
      for (const file of changedFiles) {
        lines.push(`- \`${file}\``)
      }
      lines.push('')
    }

    return lines.join('\n')
  }, [
    t,
    todayDisplay,
    agents.length,
    totalCompleted,
    totalErrors,
    agentSummaries,
    changedFiles
  ])

  const handleCopy = useCallback(async () => {
    const markdown = generateMarkdown()
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [generateMarkdown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl w-[640px] max-h-[85vh] overflow-hidden shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            <h3 className="font-semibold">{t('dailyReport.title')}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                copied
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-secondary hover:bg-accent'
              )}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied
                ? t('dailyReport.copied')
                : t('dailyReport.exportMarkdown')}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              {t('common.loading')}
            </div>
          ) : (
            <>
              {/* Date */}
              <div className="text-sm text-muted-foreground">
                {todayDisplay}
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
                  <Users size={18} className="text-blue-500" />
                  <div>
                    <div className="text-xl font-bold">{agents.length}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t('dailyReport.totalAgents')}
                    </div>
                  </div>
                </div>
                <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-green-500" />
                  <div>
                    <div className="text-xl font-bold">{totalCompleted}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t('dailyReport.completedTasks')}
                    </div>
                  </div>
                </div>
                <div className="bg-secondary rounded-lg p-3 flex items-center gap-3">
                  <XCircle size={18} className="text-red-500" />
                  <div>
                    <div className="text-xl font-bold">{totalErrors}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t('dailyReport.totalErrors')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-agent sections */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('dailyReport.agentDetails')}
                </h4>
                {agentSummaries.filter((s) => s.messageCount > 0).length ===
                0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    {t('dailyReport.noActivity')}
                  </div>
                ) : (
                  agentSummaries
                    .filter((s) => s.messageCount > 0)
                    .map((summary) => (
                      <div
                        key={summary.agent.id}
                        className="bg-secondary rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {summary.agent.name}
                            </span>
                            {summary.agent.roleLabel && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-card text-muted-foreground">
                                {summary.agent.roleLabel}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-card text-muted-foreground">
                            {t(`agent.status.${summary.agent.status}`)}
                          </span>
                        </div>

                        <div className="flex gap-4 text-[11px] text-muted-foreground">
                          <span>
                            {t('dailyReport.messages')}: {summary.messageCount}
                          </span>
                          {summary.errorCount > 0 && (
                            <span className="text-red-400">
                              {t('dailyReport.errorsCount')}:{' '}
                              {summary.errorCount}
                            </span>
                          )}
                        </div>

                        {summary.activities.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-medium text-muted-foreground">
                              {t('dailyReport.activities')}:
                            </div>
                            <ul className="space-y-0.5">
                              {summary.activities.slice(0, 5).map((activity, i) => (
                                <li
                                  key={i}
                                  className="text-[11px] text-muted-foreground pl-2 border-l-2 border-border truncate"
                                >
                                  {activity}
                                </li>
                              ))}
                              {summary.activities.length > 5 && (
                                <li className="text-[10px] text-muted-foreground pl-2 italic">
                                  {t('dailyReport.moreActivities', '+{{count}} more...', { count: summary.activities.length - 5 })}
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>

              {/* Changed files */}
              {changedFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileCode size={12} />
                    {t('dailyReport.changedFiles')}
                  </h4>
                  <div className="bg-secondary rounded-lg p-3 space-y-1">
                    {changedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="text-[11px] text-muted-foreground font-mono truncate"
                      >
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
