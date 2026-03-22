import type { BrowserWindow } from 'electron'
import { stripAnsiCodes } from '@main/utils'

// Debounce per-agent to avoid flooding renderer with events
const ptyParseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const ptyParseBuffers = new Map<string, string>()

export { ptyParseTimers, ptyParseBuffers }

export function parsePtyDataForActivityStream(
  agentId: string,
  rawData: string,
  getMainWindow: () => BrowserWindow | null
): void {
  const existing = ptyParseBuffers.get(agentId) ?? ''
  ptyParseBuffers.set(agentId, (existing + rawData).slice(-1000))

  if (ptyParseTimers.has(agentId)) return
  ptyParseTimers.set(agentId, setTimeout(() => {
    ptyParseTimers.delete(agentId)
    const buffer = ptyParseBuffers.get(agentId) ?? ''
    ptyParseBuffers.set(agentId, '')

    const clean = stripAnsiCodes(buffer)
    if (!clean.trim()) return

    let contentType: string = 'text'
    const role: string = 'agent'
    let content = clean.trim().slice(0, 200)

    const toolMatch = clean.match(/(?:Read|Write|Edit|Search|Bash|MultiTool|ListDir|Grep)\([^)]*\)/i)
    const errorMatch = clean.match(/(?:Error:|APIError|NetworkError|RateLimitError)[^\n]*/i)
    const toolUsesMatch = clean.match(/(\d+)\s+tool uses/i)

    if (toolMatch) {
      contentType = 'tool_exec'
      content = toolMatch[0].slice(0, 120)
    } else if (errorMatch) {
      contentType = 'error'
      content = errorMatch[0].slice(0, 120)
    } else if (toolUsesMatch) {
      contentType = 'tool_exec'
      content = `${toolUsesMatch[1]} tool uses`
    } else if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(buffer)) {
      return
    } else {
      const meaningful = clean.split('\n').map(l => l.trim()).filter(l => l.length > 3)
      if (meaningful.length === 0) return
      content = meaningful[meaningful.length - 1].slice(0, 200)
    }

    const message = { role, contentType, content, metadata: undefined }
    getMainWindow()?.webContents.send('agent:output', agentId, message)
  }, 300))
}

export function cleanupPtyParseState(agentId: string): void {
  const timer = ptyParseTimers.get(agentId)
  if (timer) { clearTimeout(timer); ptyParseTimers.delete(agentId) }
  ptyParseBuffers.delete(agentId)
}
