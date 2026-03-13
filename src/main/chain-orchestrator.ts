import type { Database } from './database'
import type { AgentStatus, TaskChain, Agent } from '@shared/types'

// Simple ANSI stripper
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
}

/**
 * ChainOrchestrator watches agent status changes and triggers
 * task chains when conditions are met.
 */
export class ChainOrchestrator {
  private database: Database
  private startTargetSession: (agent: Agent) => Promise<void>
  private sendTargetInput: (agentId: string, message: string) => Promise<void>
  
  /** Last output content per agent, used for keyword matching and {prev_result} */
  private lastOutputByAgent: Map<string, string> = new Map()
  private ptyBufferByAgent: Map<string, string> = new Map()

  constructor(
    database: Database,
    startTargetSession: (agent: Agent) => Promise<void>,
    sendTargetInput: (agentId: string, message: string) => Promise<void>
  ) {
    this.database = database
    this.startTargetSession = startTargetSession
    this.sendTargetInput = sendTargetInput
  }

  /**
   * Called when an agent's status changes.
   * Evaluates all active chains to see if this agent is a trigger.
   */
  handleStatusChange(agentId: string, status: AgentStatus): void {
    const chains = this.database.getChains().filter(
      (c) => c.isActive && c.triggerAgentId === agentId
    )

    if (chains.length === 0) return

    for (const chain of chains) {
      if (this.evaluateCondition(chain, agentId, status)) {
        this.executeChain(chain, agentId)
      }
    }
  }

  /**
   * Called when an agent produces output in standard mode. Stores the last output
   * for keyword matching and {prev_result} substitution.
   */
  handleAgentOutput(agentId: string, content: string): void {
    this.lastOutputByAgent.set(agentId, content)
    this.checkKeywords(agentId, content)
  }

  /**
   * Called when an agent produces raw PTY output.
   * Cleans ANSI, buffers it, and checks for keywords.
   */
  handlePtyData(agentId: string, data: string): void {
    const cleanData = stripAnsi(data)
    let buffer = (this.ptyBufferByAgent.get(agentId) || '') + cleanData
    // Keep last 50,000 characters to prevent memory leaks while keeping enough context
    buffer = buffer.slice(-50000)
    this.ptyBufferByAgent.set(agentId, buffer)
    this.lastOutputByAgent.set(agentId, buffer) // Use as prev_result
    
    this.checkKeywords(agentId, buffer)
  }

  private checkKeywords(agentId: string, content: string): void {
    const chains = this.database.getChains().filter(
      (c) =>
        c.isActive &&
        c.triggerAgentId === agentId &&
        c.triggerCondition.type === 'keyword' &&
        c.triggerCondition.keyword
    )

    for (const chain of chains) {
      const keyword = chain.triggerCondition.keyword
      if (keyword && content.includes(keyword)) {
        // Clear buffer so we don't trigger the same chain continuously 
        if (this.ptyBufferByAgent.has(agentId)) {
          this.ptyBufferByAgent.set(agentId, '')
        }
        this.executeChain(chain, agentId)
      }
    }
  }

  /**
   * Evaluate whether a chain's trigger condition is satisfied
   * based on the agent's new status.
   */
  private evaluateCondition(
    chain: TaskChain,
    _agentId: string,
    status: AgentStatus
  ): boolean {
    switch (chain.triggerCondition.type) {
      case 'complete':
        return status === 'idle'

      case 'no_error':
        // Fires on idle (completed without error)
        return status === 'idle'

      case 'keyword':
        // Keyword matching is handled in handleAgentOutput
        return false

      default:
        return false
    }
  }

  /**
   * Execute a chain: resolve template variables and send the message
   * to the target agent.
   */
  private executeChain(chain: TaskChain, triggerAgentId: string): void {
    const triggerAgent = this.database.getAgent(triggerAgentId)
    const targetAgent = this.database.getAgent(chain.targetAgentId)

    if (!targetAgent) {
      this.handleChainError(chain, `Target agent ${chain.targetAgentId} not found`)
      return
    }

    // If the target agent is in error/archived state, respect onError
    if (targetAgent.status === 'archived') {
      this.handleChainError(chain, `Target agent "${targetAgent.name}" is archived`)
      return
    }

    const prevResult = this.lastOutputByAgent.get(triggerAgentId) ?? ''
    const message = this.resolveTemplate(chain.messageTemplate, {
      prev_result: prevResult,
      agent_name: triggerAgent?.name ?? triggerAgentId,
      project_path: targetAgent.projectPath
    })

    this.sendToTarget(chain, message).catch((err: unknown) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      this.handleChainError(chain, errorMessage)
    })
  }

  /**
   * Replace template variables in the message.
   * Supports: {prev_result}, {agent_name}, {project_path}
   */
  private resolveTemplate(
    template: string,
    vars: Record<string, string>
  ): string {
    let result = template
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }
    return result
  }

  /**
   * Send the resolved message to the target agent.
   */
  private async sendToTarget(chain: TaskChain, message: string): Promise<void> {
    const targetAgent = this.database.getAgent(chain.targetAgentId)
    if (!targetAgent) return

    // If the target has no active session, start one first
    if (
      targetAgent.status === 'idle' ||
      targetAgent.status === 'error' ||
      targetAgent.status === 'creating'
    ) {
      await this.startTargetSession(targetAgent)
    }

    this.database.addMessage(chain.targetAgentId, 'manager', 'text', message, {
      chainId: chain.id,
      chainName: chain.name,
      automated: true
    })

    await this.sendTargetInput(chain.targetAgentId, message)
  }

  /**
   * Handle errors during chain execution based on the onError setting.
   */
  private handleChainError(chain: TaskChain, errorMessage: string): void {
    switch (chain.onError) {
      case 'stop':
        // Deactivate the chain
        this.database.updateChain(chain.id, { isActive: false })
        this.database.addMessage(chain.targetAgentId, 'system', 'error',
          `Chain "${chain.name}" stopped due to error: ${errorMessage}`, {
            chainId: chain.id,
            automated: true
          })
        break

      case 'skip':
        // Log the error but keep the chain active
        this.database.addMessage(chain.targetAgentId, 'system', 'text',
          `Chain "${chain.name}" skipped step due to error: ${errorMessage}`, {
            chainId: chain.id,
            automated: true
          })
        break

      case 'notify_only':
        // Just log a notification message
        this.database.addMessage(chain.targetAgentId, 'system', 'text',
          `Chain "${chain.name}" encountered an error: ${errorMessage}`, {
            chainId: chain.id,
            automated: true
          })
        break
    }
  }
}
