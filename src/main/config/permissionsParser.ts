import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ClaudeMemoryEntry, ClaudeSkillEntry } from './configTypes'
import { countLines, getLastModified, safeReadFile } from './configTypes'

export function readMemoryEntries(projectPath: string): ClaudeMemoryEntry[] {
  const claudeDir = join(homedir(), '.claude')
  const memory: ClaudeMemoryEntry[] = []

  const normalizedPath = projectPath
    .replace(/\\/g, '-')
    .replace(/:/g, '-')
    .replace(/\//g, '-')
  const memoryDir = join(claudeDir, 'projects', normalizedPath, 'memory')

  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter((f) => f.endsWith('.md'))
      for (const file of files) {
        const fullPath = join(memoryDir, file)
        memory.push({
          file,
          lineCount: countLines(fullPath),
          lastModified: getLastModified(fullPath),
          preview: safeReadFile(fullPath, 200)
        })
      }
    } catch {
      // Permission or access error
    }
  }

  return memory
}

export function readSkillsAndCommands(claudeDir: string): {
  skills: ClaudeSkillEntry[]
  commands: ClaudeSkillEntry[]
  templates: ClaudeSkillEntry[]
} {
  const skills: ClaudeSkillEntry[] = []
  const commands: ClaudeSkillEntry[] = []
  const templates: ClaudeSkillEntry[] = []

  const skillsDir = join(claudeDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir)
      for (const entry of entries) {
        const entryPath = join(skillsDir, entry)
        if (statSync(entryPath).isFile() && entry.endsWith('.md')) {
          skills.push({ name: entry.replace('.md', ''), path: entryPath, type: 'skill' })
        } else if (statSync(entryPath).isDirectory()) {
          skills.push({ name: entry, path: entryPath, type: 'skill' })
        }
      }
    } catch {
      /* */
    }
  }

  const commandsDir = join(claudeDir, 'commands')
  if (existsSync(commandsDir)) {
    try {
      const entries = readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
      for (const entry of entries) {
        commands.push({
          name: `/${entry.replace('.md', '')}`,
          path: join(commandsDir, entry),
          type: 'command'
        })
      }
    } catch {
      /* */
    }
  }

  const templatesDir = join(claudeDir, 'templates')
  if (existsSync(templatesDir)) {
    try {
      const entries = readdirSync(templatesDir)
      for (const entry of entries) {
        templates.push({
          name: entry,
          path: join(templatesDir, entry),
          type: 'template'
        })
      }
    } catch {
      /* */
    }
  }

  return { skills, commands, templates }
}

export function readAgentTeamsData(): import('./configTypes').AgentTeamsData {
  const home = homedir()
  const tasksDir = join(home, '.claude', 'tasks')
  const teamsDir = join(home, '.claude', 'teams')

  const taskSessions: import('./configTypes').AgentTeamsData['taskSessions'] = []
  const teamConfigs: import('./configTypes').AgentTeamsData['teamConfigs'] = []

  // Scan ~/.claude/tasks/
  if (existsSync(tasksDir)) {
    try {
      const entries = readdirSync(tasksDir)
      const withMtime = entries
        .map((entry) => {
          const entryPath = join(tasksDir, entry)
          try {
            const stat = statSync(entryPath)
            if (!stat.isDirectory()) return null
            return { name: entry, path: entryPath, mtime: stat.mtime }
          } catch {
            return null
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 100)

      for (const entry of withMtime) {
        const lockPath = join(entry.path, '.lock')
        const hwmPath = join(entry.path, '.highwatermark')

        let isLocked = false
        let highwatermark = 0
        let lastModified = entry.mtime.toISOString()

        if (existsSync(lockPath)) {
          try {
            const lockStat = statSync(lockPath)
            isLocked = lockStat.size > 0
          } catch {
            /* */
          }
        }

        if (existsSync(hwmPath)) {
          try {
            const hwmContent = readFileSync(hwmPath, 'utf-8').trim()
            highwatermark = parseInt(hwmContent, 10) || 0
            const hwmStat = statSync(hwmPath)
            lastModified = hwmStat.mtime.toISOString()
          } catch {
            /* */
          }
        }

        taskSessions.push({
          sessionId: entry.name,
          isLocked,
          highwatermark,
          lastModified
        })
      }
    } catch {
      /* */
    }
  }

  // Scan ~/.claude/teams/
  if (existsSync(teamsDir)) {
    try {
      const entries = readdirSync(teamsDir)
      for (const entry of entries) {
        const configPath = join(teamsDir, entry, 'config.json')
        if (existsSync(configPath)) {
          try {
            const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
            teamConfigs.push({
              teamName: String(raw.name ?? entry),
              members: Array.isArray(raw.members) ? raw.members.map(String) : [],
              metadata: typeof raw === 'object' ? raw : {}
            })
          } catch {
            /* */
          }
        }
      }
    } catch {
      /* */
    }
  }

  return {
    taskSessions,
    teamConfigs,
    lastScannedAt: new Date().toISOString()
  }
}

export function readFileContent(filePath: string): string {
  try {
    const stats = statSync(filePath)
    if (stats.size > 1024 * 1024) return '[File too large to display]'
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}
