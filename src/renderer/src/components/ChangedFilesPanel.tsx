import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { cn } from '@lib/utils'
import { FileEdit, FilePlus, FileSearch, ChevronDown, ChevronRight, Files } from 'lucide-react'

type FileAction = 'M' | 'A' | 'R'

interface ChangedFile {
  path: string
  action: FileAction
  lastSeen: number
}

interface ChangedFilesPanelProps {
  agentId: string
}

const actionOrder: Record<FileAction, number> = { M: 0, A: 1, R: 2 }

const actionIcons: Record<FileAction, typeof FileEdit> = {
  M: FileEdit,
  A: FilePlus,
  R: FileSearch
}

const actionColors: Record<FileAction, string> = {
  M: 'text-yellow-400',
  A: 'text-green-400',
  R: 'text-zinc-500'
}

function extractFileAction(content: string): { action: FileAction; filePath: string } | null {
  const lines = content.split('\n')

  let action: FileAction | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[Edit]')) {
      action = 'M'
      break
    }
    if (trimmed.startsWith('[Write]')) {
      action = 'A'
      break
    }
    if (trimmed.startsWith('[Read]')) {
      action = 'R'
      break
    }
  }

  if (!action) return null

  // Try to extract file path from JSON content after tool name line
  // Look for "file_path" or "path" keys in the content
  const filePathMatch = content.match(/"file_path"\s*:\s*"([^"]+)"/)
    || content.match(/"path"\s*:\s*"([^"]+)"/)
  if (filePathMatch) {
    return { action, filePath: filePathMatch[1] }
  }

  // Fallback: look for a file path pattern on lines after the tool tag
  const toolLineIndex = lines.findIndex(
    (l) => l.trim().startsWith('[Edit]') || l.trim().startsWith('[Write]') || l.trim().startsWith('[Read]')
  )
  if (toolLineIndex >= 0) {
    for (let i = toolLineIndex; i < lines.length; i++) {
      const pathMatch = lines[i].match(/(?:^|\s)((?:\/|[A-Za-z]:[\\/])[^\s"']+\.\w+)/)
      if (pathMatch) {
        return { action, filePath: pathMatch[1] }
      }
    }
  }

  return null
}

function shortenPath(filePath: string): string {
  // Normalize backslashes
  const normalized = filePath.replace(/\\/g, '/')
  // Show last 3 segments at most
  const parts = normalized.split('/')
  if (parts.length <= 3) return normalized
  return '.../' + parts.slice(-3).join('/')
}

export function ChangedFilesPanel({ agentId }: ChangedFilesPanelProps): JSX.Element {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const messages = useAppStore((state) => state.messages[agentId] || [])

  const changedFiles = useMemo(() => {
    const fileMap = new Map<string, ChangedFile>()

    messages.forEach((msg, index) => {
      if (msg.role !== 'tool' && msg.contentType !== 'tool_exec') return
      const result = extractFileAction(msg.content)
      if (!result) return

      const existing = fileMap.get(result.filePath)
      // Keep the most recent action, but M/A always override R
      if (
        !existing ||
        index > existing.lastSeen ||
        (existing.action === 'R' && result.action !== 'R')
      ) {
        fileMap.set(result.filePath, {
          path: result.filePath,
          action: result.action,
          lastSeen: index
        })
      }
    })

    return Array.from(fileMap.values()).sort((a, b) => {
      const orderDiff = actionOrder[a.action] - actionOrder[b.action]
      if (orderDiff !== 0) return orderDiff
      return a.path.localeCompare(b.path)
    })
  }, [messages])

  const fileCount = changedFiles.length
  const writeCount = changedFiles.filter((f) => f.action !== 'R').length

  if (fileCount === 0) return <></>

  return (
    <div className="border-t border-zinc-700/50 bg-zinc-900/80">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-xs',
          'text-zinc-400 hover:text-zinc-200 transition-colors'
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Files className="h-3 w-3 shrink-0" />
        <span className="font-medium">{t('files.title')}</span>
        <span className="text-zinc-500">
          ({writeCount}/{fileCount})
        </span>
      </button>

      {isOpen && (
        <div className="max-h-40 overflow-y-auto px-3 pb-2">
          {changedFiles.map((file) => {
            const Icon = actionIcons[file.action]
            const colorClass = actionColors[file.action]
            return (
              <div
                key={file.path}
                className={cn(
                  'flex items-center gap-2 py-0.5 text-xs font-mono',
                  file.action === 'R' ? 'opacity-50' : ''
                )}
                title={file.path}
              >
                <Icon className={cn('h-3 w-3 shrink-0', colorClass)} />
                <span className={cn('font-bold', colorClass)}>
                  {file.action}
                </span>
                <span className={cn('truncate', file.action === 'R' ? 'text-zinc-500' : 'text-zinc-300')}>
                  {shortenPath(file.path)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
