/**
 * Facade module — re-exports all config reading functions from sub-modules.
 * Kept for backward compatibility with `@main/claudeConfigReader` imports.
 */

// Types
export type {
  ClaudeRuleFile,
  ClaudeMemoryEntry,
  ClaudeSkillEntry,
  ClaudeMcpServer,
  ClaudeHook,
  AgentProfileData,
  WorkspaceConfigData,
  AgentTeamsData,
  SubagentDefinition
} from './configTypes'

// Profile
export { readAgentProfile } from './profileReader'

// Workspace & config map
export {
  readWorkspaceConfig,
  readGlobalSkills,
  readSubagentDefinitions,
  readConfigMapData,
  readWorkspaceConfigSummary,
  readAllWorkspacesSummary
} from './workspaceConfigReader'

// Permissions & misc
export { readAgentTeamsData, readFileContent } from './permissionsParser'
