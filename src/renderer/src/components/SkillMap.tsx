import { useMemo, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../lib/utils'
import { getStatusDot, getInitials } from '../lib/status'
import { Sparkles, Plus } from 'lucide-react'
import type { ClaudeSkillEntry } from '@shared/types'

interface SkillMapProps {
  onAgentClick: (id: string) => void
}

export function SkillMap({ onAgentClick }: SkillMapProps): JSX.Element {
  const { t } = useTranslation()
  const { agents, updateAgentInList } = useAppStore()
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  // Fetch available global skills
  const [globalSkills, setGlobalSkills] = useState<ClaudeSkillEntry[]>([])
  const loadGlobalSkills = useCallback(async () => {
    try {
      const skills = await window.api.getGlobalSkills()
      setGlobalSkills(skills)
    } catch { /* */ }
  }, [])
  useEffect(() => { loadGlobalSkills() }, [loadGlobalSkills])

  // Build skill → agents mapping
  const skillGroups = useMemo(() => {
    const map = new Map<string, typeof activeAgents>()
    for (const agent of activeAgents) {
      for (const skill of agent.skills) {
        const normalized = skill.trim()
        if (!normalized) continue
        if (!map.has(normalized)) map.set(normalized, [])
        map.get(normalized)!.push(agent)
      }
    }
    // Sort by member count descending
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [activeAgents])

  const agentsWithoutSkills = activeAgents.filter((a) => a.skills.length === 0)

  if (activeAgents.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        {t('agent.noAgents')}
      </div>
    )
  }

  if (skillGroups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        {t('profile.skills')}: {t('teamMgmt.noMembers')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {skillGroups.map(([skill, members]) => (
        <div key={skill} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {skill}
            </span>
            <span className="text-[10px] text-muted-foreground">{members.length}</span>
            {/* Skill coverage bar */}
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/40 rounded-full"
                style={{ width: `${Math.min((members.length / activeAgents.length) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-1">
            {members.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onAgentClick(agent.id)}
                aria-label={`${agent.name} - ${agent.status}`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium">
                    {getInitials(agent.name)}
                  </div>
                  <div className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card', getStatusDot(agent.status))} />
                </div>
                <span className="text-[11px]">{agent.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {agentsWithoutSkills.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">{t('agent.skills')}: —</span>
          <div className="flex flex-wrap gap-1.5 pl-1">
            {agentsWithoutSkills.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onAgentClick(agent.id)}
                aria-label={`${agent.name} - no skills assigned`}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-card border border-border/50 hover:bg-accent/50 transition-colors opacity-60"
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium">
                  {getInitials(agent.name)}
                </div>
                <span className="text-[11px]">{agent.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Available Skills from .claude/skills/ */}
      {globalSkills.length > 0 && (
        <AvailableSkillsSection
          globalSkills={globalSkills}
          agents={activeAgents}
          assignedSkillNames={new Set(skillGroups.map(([name]) => name))}
          onAssign={async (agentId, skillName) => {
            const agent = activeAgents.find(a => a.id === agentId)
            if (!agent) return
            const newSkills = [...new Set([...agent.skills, skillName])]
            await window.api.updateAgent(agentId, { skills: newSkills })
            updateAgentInList(agentId, { skills: newSkills })
          }}
        />
      )}
    </div>
  )
}

function AvailableSkillsSection({
  globalSkills,
  agents,
  assignedSkillNames,
  onAssign
}: {
  globalSkills: ClaudeSkillEntry[]
  agents: Array<{ id: string; name: string; skills: string[] }>
  assignedSkillNames: Set<string>
  onAssign: (agentId: string, skillName: string) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const [assigningSkill, setAssigningSkill] = useState<string | null>(null)

  const unassignedSkills = globalSkills.filter(s => !assignedSkillNames.has(s.name))

  if (unassignedSkills.length === 0 && globalSkills.length > 0) {
    return <></>
  }

  return (
    <div className="space-y-1.5 pt-3 border-t border-border">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-amber-500" />
        <span className="text-[11px] font-semibold text-muted-foreground">
          {t('skillMap.availableSkills', 'Available Skills')}
        </span>
        <span className="text-[10px] text-muted-foreground">({globalSkills.length})</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-1">
        {globalSkills.map((skill) => {
          const isAssigned = assignedSkillNames.has(skill.name)
          return (
            <div key={skill.path} className="relative">
              <button
                onClick={() => setAssigningSkill(assigningSkill === skill.name ? null : skill.name)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] border transition-colors',
                  isAssigned
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/30 hover:text-foreground'
                )}
              >
                {skill.name}
              </button>

              {/* Assign dropdown */}
              {assigningSkill === skill.name && !isAssigned && (
                <div className="absolute top-6 left-0 z-50 bg-card border border-border rounded-md shadow-lg p-1 min-w-[120px]">
                  <div className="text-[9px] text-muted-foreground px-2 py-0.5 border-b border-border mb-0.5">
                    {t('skillMap.assignTo', 'Assign to')}:
                  </div>
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={async () => {
                        await onAssign(agent.id, skill.name)
                        setAssigningSkill(null)
                      }}
                      className="w-full text-left px-2 py-1 text-[10px] hover:bg-accent rounded-sm flex items-center gap-1"
                    >
                      <Plus size={8} />
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
