import { existsSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { ClaudeRuleFile } from './configTypes'
import { countLines, getFileSize, safeReadFile } from './configTypes'

export function readClaudeMdFiles(projectPath: string): ClaudeRuleFile[] {
  const home = homedir()
  const claudeDir = join(home, '.claude')
  const rules: ClaudeRuleFile[] = []

  const globalClaudeMd = join(home, 'CLAUDE.md')
  if (existsSync(globalClaudeMd)) {
    rules.push({
      path: globalClaudeMd,
      name: '~/CLAUDE.md',
      level: 'global',
      lineCount: countLines(globalClaudeMd),
      sizeBytes: getFileSize(globalClaudeMd),
      preview: safeReadFile(globalClaudeMd, 200)
    })
  }

  const globalClaudeDir = join(claudeDir, 'CLAUDE.md')
  if (existsSync(globalClaudeDir)) {
    rules.push({
      path: globalClaudeDir,
      name: '~/.claude/CLAUDE.md',
      level: 'global',
      lineCount: countLines(globalClaudeDir),
      sizeBytes: getFileSize(globalClaudeDir),
      preview: safeReadFile(globalClaudeDir, 200)
    })
  }

  const projectClaudeMd = join(projectPath, 'CLAUDE.md')
  if (existsSync(projectClaudeMd)) {
    rules.push({
      path: projectClaudeMd,
      name: `${basename(projectPath)}/CLAUDE.md`,
      level: 'project',
      lineCount: countLines(projectClaudeMd),
      sizeBytes: getFileSize(projectClaudeMd),
      preview: safeReadFile(projectClaudeMd, 200)
    })
  }

  const projectClaudeSubMd = join(projectPath, '.claude', 'CLAUDE.md')
  if (existsSync(projectClaudeSubMd)) {
    rules.push({
      path: projectClaudeSubMd,
      name: `${basename(projectPath)}/.claude/CLAUDE.md`,
      level: 'project',
      lineCount: countLines(projectClaudeSubMd),
      sizeBytes: getFileSize(projectClaudeSubMd),
      preview: safeReadFile(projectClaudeSubMd, 200)
    })
  }

  return rules
}
