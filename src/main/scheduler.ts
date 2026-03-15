import type { Database } from './database'
import type { TaskChain } from '@shared/types'

interface ScheduledJob {
  chainId: string
  timer: ReturnType<typeof setInterval>
}

type ExecuteChainCallback = (chain: TaskChain) => void

/**
 * ChainScheduler manages interval-based chain execution.
 * Follows the same setInterval pattern as the memory monitor.
 */
export class ChainScheduler {
  private database: Database
  private executeChain: ExecuteChainCallback
  private jobs: Map<string, ScheduledJob> = new Map()
  private running = false

  constructor(database: Database, executeChain: ExecuteChainCallback) {
    this.database = database
    this.executeChain = executeChain
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.syncJobs()
  }

  stop(): void {
    this.running = false
    for (const job of this.jobs.values()) {
      clearInterval(job.timer)
    }
    this.jobs.clear()
  }

  /** Re-sync all scheduled chains from DB */
  syncJobs(): void {
    if (!this.running) return

    const scheduledChains = this.database.getScheduledChains()
    const activeIds = new Set(scheduledChains.map(c => c.id))

    // Remove jobs that are no longer scheduled or active
    for (const [chainId, job] of this.jobs.entries()) {
      if (!activeIds.has(chainId)) {
        clearInterval(job.timer)
        this.jobs.delete(chainId)
      }
    }

    // Add new jobs
    for (const chain of scheduledChains) {
      if (!this.jobs.has(chain.id)) {
        this.addJob(chain)
      }
    }
  }

  addJob(chain: TaskChain): void {
    if (this.jobs.has(chain.id)) return
    const intervalMs = (chain.triggerCondition.intervalMinutes ?? 60) * 60 * 1000
    const timer = setInterval(() => {
      // Re-fetch chain from DB to check if still active
      const freshChains = this.database.getChains()
      const freshChain = freshChains.find(c => c.id === chain.id)
      if (freshChain && freshChain.isActive && freshChain.triggerCondition.type === 'scheduled') {
        this.executeChain(freshChain)
      }
    }, intervalMs)
    this.jobs.set(chain.id, { chainId: chain.id, timer })
  }

  removeJob(chainId: string): void {
    const job = this.jobs.get(chainId)
    if (job) {
      clearInterval(job.timer)
      this.jobs.delete(chainId)
    }
  }

  updateJob(chain: TaskChain): void {
    this.removeJob(chain.id)
    if (chain.isActive && chain.triggerCondition.type === 'scheduled') {
      this.addJob(chain)
    }
  }

  getNextExecutionTime(chainId: string): string | null {
    const job = this.jobs.get(chainId)
    if (!job) return null
    const chain = this.database.getChains().find(c => c.id === chainId)
    if (!chain) return null
    const intervalMs = (chain.triggerCondition.intervalMinutes ?? 60) * 60 * 1000
    // Estimate next execution based on last execution log
    const logs = this.database.getChainExecutionLogs(1)
    const lastLog = logs.find(l => l.chainId === chainId)
    if (lastLog) {
      const lastTime = new Date(lastLog.startedAt).getTime()
      return new Date(lastTime + intervalMs).toISOString()
    }
    // No history — estimate from now
    return new Date(Date.now() + intervalMs).toISOString()
  }

  getActiveJobCount(): number {
    return this.jobs.size
  }
}
