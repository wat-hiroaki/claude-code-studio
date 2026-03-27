import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@lib/utils'
import {
  FileText, Brain, Zap, Plug, Shield,
  ChevronDown, ChevronRight, Eye, X
} from 'lucide-react'
import type { AgentProfileData, ClaudeRuleFile, ClaudeSkillEntry } from '@shared/types'

interface AgentProfileViewProps {
  agentId: string
  agentName: string
  onClose: () => void
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle
}: {
  icon: typeof FileText
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
    >
      <Icon size={14} className="text-primary shrink-0" />
      <span className="text-xs font-semibold flex-1 text-left">{title}</span>
      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
        {count}
      </span>
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
  )
}

function RuleItem({ rule, onView }: { rule: ClaudeRuleFile; onView: (path: string) => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20 transition-colors group">
      <div className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        rule.level === 'global' ? 'bg-blue-400' : 'bg-green-400'
      )} />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-mono truncate block">{rule.name}</span>
        <span className="text-[9px] text-muted-foreground">
          {rule.lineCount} lines · {(rule.sizeBytes / 1024).toFixed(1)}KB
        </span>
      </div>
      <button
        onClick={() => onView(rule.path)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted/50 text-muted-foreground transition-all"
        title={t('common.view', 'View')}
      >
        <Eye size={10} />
      </button>
    </div>
  )
}

function SkillItem({ skill }: { skill: ClaudeSkillEntry }): JSX.Element {
  const typeColor = skill.type === 'command' ? 'bg-blue-500/20 text-blue-400'
    : skill.type === 'template' ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-green-500/20 text-green-400'

  return (
    <div className="flex items-center gap-2 px-4 py-1 hover:bg-muted/20 transition-colors">
      <span className={cn('text-[8px] px-1 py-0.5 rounded', typeColor)}>
        {skill.type}
      </span>
      <span className="text-[11px] font-mono truncate">{skill.name}</span>
    </div>
  )
}

export function AgentProfileView({ agentId, agentName, onClose }: AgentProfileViewProps): JSX.Element {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<AgentProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    rules: true, memory: true, skills: false, mcp: false, hooks: false
  })
  const [viewingFile, setViewingFile] = useState<{ path: string; content: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.api.getAgentProfile(agentId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [agentId])

  const toggleSection = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleViewFile = useCallback(async (filePath: string) => {
    try {
      const content = await window.api.readConfigFile(filePath)
      setViewingFile({ path: filePath, content })
    } catch {
      // Silently fail
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground/50">
        <span className="text-xs">{t('common.loading')}</span>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="flex h-full items-center justify-center text-red-400/50">
        <span className="text-xs">{error || t('profile.loadError', 'Failed to load profile')}</span>
      </div>
    )
  }

  // File viewer overlay
  if (viewingFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/60">
          <span className="text-xs font-mono truncate">{viewingFile.path.split(/[/\\]/).pop()}</span>
          <button onClick={() => setViewingFile(null)} className="p-1 rounded hover:bg-muted/50">
            <X size={12} />
          </button>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
          {viewingFile.content}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-card/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{t('profile.title', 'Agent Profile')}</span>
          <span className="text-[10px] text-muted-foreground">— {agentName}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50">
          <X size={12} />
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Rules */}
        <SectionHeader
          icon={FileText}
          title={t('profile.rules', 'Rules (CLAUDE.md)')}
          count={profile.rules.length}
          expanded={expanded.rules}
          onToggle={() => toggleSection('rules')}
        />
        {expanded.rules && (
          <div className="pb-1">
            {profile.rules.length === 0 ? (
              <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noRules', 'No CLAUDE.md files found')}</p>
            ) : (
              profile.rules.map((rule) => (
                <RuleItem key={rule.path} rule={rule} onView={handleViewFile} />
              ))
            )}
          </div>
        )}

        {/* Memory */}
        <SectionHeader
          icon={Brain}
          title={t('profile.memory', 'Memory')}
          count={profile.memory.length}
          expanded={expanded.memory}
          onToggle={() => toggleSection('memory')}
        />
        {expanded.memory && (
          <div className="pb-1">
            {profile.memory.length === 0 ? (
              <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noMemory', 'No memory files')}</p>
            ) : (
              profile.memory.map((mem) => (
                <div key={mem.file} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20">
                  <Brain size={10} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-mono truncate block">{mem.file}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {mem.lineCount} lines · {mem.lastModified ? new Date(mem.lastModified).toLocaleDateString() : 'unknown'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Skills & Commands */}
        <SectionHeader
          icon={Zap}
          title={t('profile.skills', 'Skills & Commands')}
          count={profile.skills.length}
          expanded={expanded.skills}
          onToggle={() => toggleSection('skills')}
        />
        {expanded.skills && (
          <div className="pb-1">
            {profile.skills.length === 0 ? (
              <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noSkills', 'No skills or commands')}</p>
            ) : (
              profile.skills.map((skill) => (
                <SkillItem key={skill.path} skill={skill} />
              ))
            )}
          </div>
        )}

        {/* MCP Servers */}
        <SectionHeader
          icon={Plug}
          title={t('profile.mcp', 'MCP Servers')}
          count={profile.mcpServers.length}
          expanded={expanded.mcp}
          onToggle={() => toggleSection('mcp')}
        />
        {expanded.mcp && (
          <div className="pb-1">
            {profile.mcpServers.length === 0 ? (
              <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noMcp', 'No MCP servers configured')}</p>
            ) : (
              profile.mcpServers.map((server) => (
                <div key={server.name} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20">
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    server.enabled ? 'bg-green-400' : 'bg-muted-foreground/30'
                  )} />
                  <span className="text-[11px] font-medium">{server.name}</span>
                  <span className="text-[9px] text-muted-foreground font-mono truncate">
                    {server.command}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Hooks / Guardrails */}
        <SectionHeader
          icon={Shield}
          title={t('profile.hooks', 'Guardrails & Hooks')}
          count={profile.hooks.length}
          expanded={expanded.hooks}
          onToggle={() => toggleSection('hooks')}
        />
        {expanded.hooks && (
          <div className="pb-1">
            {profile.hooks.length === 0 ? (
              <p className="px-4 py-1 text-[10px] text-muted-foreground/50">{t('profile.noHooks', 'No hooks configured')}</p>
            ) : (
              profile.hooks.map((hook, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-1.5 hover:bg-muted/20">
                  <Shield size={10} className="text-muted-foreground shrink-0" />
                  <span className="text-[10px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400">
                    {hook.event}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {hook.command}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
