import { useTranslation } from 'react-i18next'
import { useAppStore } from '@stores/useAppStore'
import { cn } from '@lib/utils'
import { getStatusDot, getInitials } from '@lib/status'
import { ChevronDown } from 'lucide-react'
import type { Agent, Team } from '@shared/types'

interface OrgChartProps {
  teams: Team[]
  onAgentClick: (id: string) => void
}

interface TreeNode {
  agent: Agent
  children: TreeNode[]
}

function buildTree(agents: Agent[]): { roots: TreeNode[]; orphans: Agent[] } {
  const nodeMap = new Map<string, TreeNode>()
  for (const agent of agents) {
    nodeMap.set(agent.id, { agent, children: [] })
  }

  const roots: TreeNode[] = []
  const orphans: Agent[] = []

  for (const agent of agents) {
    const node = nodeMap.get(agent.id)!
    if (agent.reportTo && nodeMap.has(agent.reportTo)) {
      nodeMap.get(agent.reportTo)!.children.push(node)
    } else if (agent.reportTo) {
      // reportTo points to non-existent agent
      orphans.push(agent)
    } else {
      roots.push(node)
    }
  }

  return { roots, orphans }
}

function AgentNode({ node, onAgentClick, depth }: { node: TreeNode; onAgentClick: (id: string) => void; depth: number }): JSX.Element {
  const { t } = useTranslation()
  const { agent } = node

  return (
    <div className={cn('relative', depth > 0 && 'ml-8')}>
      {/* Connector line */}
      {depth > 0 && (
        <div className="absolute -left-4 top-5 w-4 border-t border-border" />
      )}
      {depth > 0 && (
        <div className="absolute -left-4 -top-2 bottom-1/2 border-l border-border" />
      )}

      <button
        onClick={() => onAgentClick(agent.id)}
        className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors w-full text-left mb-2"
      >
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
            {getInitials(agent.name)}
          </div>
          <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card', getStatusDot(agent.status))} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{agent.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {agent.roleLabel || t(`agent.status.${agent.status}`)}
          </div>
          {agent.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {agent.skills.slice(0, 3).map((skill) => (
                <span key={skill} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
        {node.children.length > 0 && (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>

      {node.children.length > 0 && (
        <div className="relative">
          {node.children.map((child) => (
            <AgentNode key={child.agent.id} node={child} onAgentClick={onAgentClick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function OrgChart({ teams, onAgentClick }: OrgChartProps): JSX.Element {
  const { t } = useTranslation()
  const { agents } = useAppStore()
  const activeAgents = agents.filter((a) => a.status !== 'archived')

  // Group by team
  const teamGroups = teams.map((team) => ({
    team,
    agents: activeAgents.filter((a) => a.teamId === team.id)
  }))
  const unassigned = activeAgents.filter((a) => !a.teamId)

  return (
    <div className="space-y-4">
      {teamGroups.map(({ team, agents: teamAgents }) => {
        if (teamAgents.length === 0) return null
        const { roots, orphans } = buildTree(teamAgents)

        return (
          <div key={team.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
              <h4 className="text-xs font-semibold uppercase tracking-wider">{team.name}</h4>
              <span className="text-[10px] text-muted-foreground">{teamAgents.length}</span>
            </div>
            <div className="pl-1">
              {roots.map((node) => (
                <AgentNode key={node.agent.id} node={node} onAgentClick={onAgentClick} depth={0} />
              ))}
              {orphans.map((agent) => (
                <AgentNode key={agent.id} node={{ agent, children: [] }} onAgentClick={onAgentClick} depth={0} />
              ))}
            </div>
          </div>
        )
      })}

      {unassigned.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('teamMgmt.unassigned')}
          </h4>
          <div className="pl-1">
            {(() => {
              const { roots, orphans } = buildTree(unassigned)
              return (
                <>
                  {roots.map((node) => (
                    <AgentNode key={node.agent.id} node={node} onAgentClick={onAgentClick} depth={0} />
                  ))}
                  {orphans.map((agent) => (
                    <AgentNode key={agent.id} node={{ agent, children: [] }} onAgentClick={onAgentClick} depth={0} />
                  ))}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {activeAgents.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">
          {t('agent.noAgents')}
        </div>
      )}
    </div>
  )
}
