import { join } from 'path'
import { homedir } from 'os'
import type { AgentProfileData } from './configTypes'
import { readClaudeMdFiles } from './claudeMdParser'
import { readGlobalMcpServers, readHooks } from './mcpConfigParser'
import { readMemoryEntries, readSkillsAndCommands } from './permissionsParser'

export function readAgentProfile(projectPath: string): AgentProfileData {
  const home = homedir()
  const claudeDir = join(home, '.claude')

  const rules = readClaudeMdFiles(projectPath)
  const memory = readMemoryEntries(projectPath)

  const { skills: skillEntries, commands, templates } = readSkillsAndCommands(claudeDir)
  // Merge skills, commands, templates into a single array (legacy behavior)
  const skills = [
    ...skillEntries,
    ...commands.map((c) => ({ ...c, type: 'command' as const })),
    ...templates.map((t) => ({ ...t, type: 'template' as const }))
  ]

  const mcpServers = readGlobalMcpServers()
  const hooks = readHooks()

  return { rules, memory, skills, mcpServers, hooks }
}
