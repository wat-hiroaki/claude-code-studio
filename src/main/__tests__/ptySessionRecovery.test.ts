import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { Agent, AgentStatus } from '@shared/types'

// ---------------------------------------------------------------------------
// Mock: electron (transitive dep via sessionManager → i18n)
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), getLocale: vi.fn(() => 'en') },
  dialog: { showMessageBox: vi.fn() },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() }
}))

// ---------------------------------------------------------------------------
// Mock: node-pty
// ---------------------------------------------------------------------------
const mockPtyWrite = vi.fn()
const mockPtyKill = vi.fn()
const mockPtyResize = vi.fn()

let ptyOnDataHandler: ((data: string) => void) | null = null
let ptyOnExitHandler: ((e: { exitCode: number }) => void) | null = null

const mockPtyProcess = {
  pid: 12345,
  onData: vi.fn((cb: (data: string) => void) => { ptyOnDataHandler = cb }),
  onExit: vi.fn((cb: (e: { exitCode: number }) => void) => { ptyOnExitHandler = cb }),
  write: mockPtyWrite,
  kill: mockPtyKill,
  resize: mockPtyResize,
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess)
}))

// ---------------------------------------------------------------------------
// Mock: child_process (used by resolveClaudePath)
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(() => 'claude'),
  spawn: vi.fn()
}))

// ---------------------------------------------------------------------------
// Mock: fs (used by resolveClaudePath + validateProjectPath)
// ---------------------------------------------------------------------------
vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => {
    // Return true for project paths (validateProjectPath), false for claude binary lookup
    if (typeof p === 'string' && p.includes('test-project')) return true
    return false
  }),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  readFileSync: vi.fn(() => '{}')
}))

// ---------------------------------------------------------------------------
// Mock: uuid
// ---------------------------------------------------------------------------
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`)
}))

// ---------------------------------------------------------------------------
// Mock: database
// ---------------------------------------------------------------------------
const mockDatabase = {
  getScrollback: vi.fn(() => ''),
  saveAllScrollbacks: vi.fn(),
  updateAgent: vi.fn((_id: string, _updates: Record<string, unknown>) => makeAgent()),
  getAgent: vi.fn((_id: string) => makeAgent()),
}

// ---------------------------------------------------------------------------
// Helper: create a test Agent
// ---------------------------------------------------------------------------
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    icon: null,
    roleLabel: null,
    workspaceId: null,
    projectPath: process.platform === 'win32' ? 'C:/Users/user/test-project' : '/home/user/test-project',
    projectName: 'test-project',
    sessionNumber: 1,
    status: 'idle' as AgentStatus,
    currentTask: null,
    systemPrompt: null,
    claudeSessionId: null,
    isPinned: false,
    skills: [],
    teamId: null,
    reportTo: null,
    parentAgentId: null,
    isTemporary: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------
import * as pty from 'node-pty'
import { PtySessionManager } from '../ptySessionManager'

describe('PtySessionManager — session recovery logic', () => {
  let manager: PtySessionManager
  const onData = vi.fn()
  const onStatusChange = vi.fn()
  const onExit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    uuidCounter = 0
    ptyOnDataHandler = null
    ptyOnExitHandler = null

    manager = new PtySessionManager(
      mockDatabase as unknown as import('../database').Database,
      onData,
      onStatusChange,
      onExit
    )
  })

  // =========================================================================
  // 1. --resume vs --session-id argument construction
  // =========================================================================
  describe('argument construction (--resume vs --session-id)', () => {
    it('uses --resume when claudeSessionId exists (reconnection)', async () => {
      const agent = makeAgent({ claudeSessionId: 'existing-session-123' })
      await manager.startSession(agent)

      const spawnCall = (pty.spawn as Mock).mock.calls[0]
      const args: string[] = spawnCall[1]

      // On Windows: ['/c', claudePath, '--resume', sessionId, '--verbose']
      // On Unix: ['--resume', sessionId, '--verbose']
      expect(args).toEqual(expect.arrayContaining(['--resume', 'existing-session-123', '--verbose']))
      expect(args).not.toEqual(expect.arrayContaining(['--session-id']))
    })

    it('uses --session-id when claudeSessionId is null (new session)', async () => {
      const agent = makeAgent({ claudeSessionId: null })
      await manager.startSession(agent)

      const spawnCall = (pty.spawn as Mock).mock.calls[0]
      const args: string[] = spawnCall[1]

      // Should generate a new UUID and use --session-id
      expect(args).toEqual(expect.arrayContaining(['--session-id']))
      expect(args).toEqual(expect.arrayContaining(['--verbose']))
      expect(args).not.toEqual(expect.arrayContaining(['--resume']))
    })

    it('saves the new session ID to database for new sessions', async () => {
      const agent = makeAgent({ claudeSessionId: null })
      await manager.startSession(agent)

      // updateAgent should be called with the generated session ID
      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          status: 'active',
          claudeSessionId: expect.stringMatching(/^mock-uuid-/)
        })
      )
    })

    it('preserves existing session ID for resumed sessions', async () => {
      const agent = makeAgent({ claudeSessionId: 'keep-this-id' })
      await manager.startSession(agent)

      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          status: 'active',
          claudeSessionId: 'keep-this-id'
        })
      )
    })

    it('includes --system-prompt when agent has systemPrompt', async () => {
      const agent = makeAgent({ claudeSessionId: null, systemPrompt: 'You are a helper.' })
      await manager.startSession(agent)

      const spawnCall = (pty.spawn as Mock).mock.calls[0]
      const args: string[] = spawnCall[1]

      expect(args).toEqual(expect.arrayContaining(['--system-prompt', 'You are a helper.']))
    })
  })

  // =========================================================================
  // 2. Auto-recovery counter logic (MAX_AUTO_RECOVERY = 3)
  // =========================================================================
  describe('auto-recovery counter logic', () => {
    it('triggers auto-recovery on unexpected exit (exitCode != 0)', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)
      await manager.startSession(agent)

      // Simulate unexpected exit (e.g., network error)
      ptyOnExitHandler!({ exitCode: 1 })

      // Should set status to error and schedule recovery
      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ status: 'error' })
      )
      expect(onStatusChange).toHaveBeenCalledWith('agent-1', 'error')
      expect(onExit).toHaveBeenCalledWith('agent-1', 1)
    })

    it('performs recovery after base delay (2000ms for first attempt)', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)
      await manager.startSession(agent)

      // Clear the spawn mock to track recovery call
      ;(pty.spawn as Mock).mockClear()

      // Trigger unexpected exit
      ptyOnExitHandler!({ exitCode: 1 })

      // Before delay: no new spawn
      expect(pty.spawn).not.toHaveBeenCalled()

      // Advance past the 2000ms base delay
      await vi.advanceTimersByTimeAsync(2000)

      // Recovery should have spawned a new pty
      expect(pty.spawn).toHaveBeenCalledTimes(1)
    })

    it('uses exponential backoff: 2s, 4s, 8s for attempts 1-3', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)

      // Attempt 1: trigger first session + exit
      await manager.startSession(agent)
      ;(pty.spawn as Mock).mockClear()
      ptyOnExitHandler!({ exitCode: 1 })

      // First recovery at 2000ms
      await vi.advanceTimersByTimeAsync(2000)
      expect(pty.spawn).toHaveBeenCalledTimes(1)

      // The new session should have _autoRecoveryCount = 1
      // Simulate exit again from the recovered session
      ;(pty.spawn as Mock).mockClear()
      ptyOnExitHandler!({ exitCode: 1 })

      // Second recovery at 4000ms (2000 * 2^1)
      await vi.advanceTimersByTimeAsync(3999)
      expect(pty.spawn).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(pty.spawn).toHaveBeenCalledTimes(1)
    })

    it('stops recovery after MAX_AUTO_RECOVERY (3) attempts', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)

      await manager.startSession(agent)

      // First: trigger exit → recovery attempt 1
      ptyOnExitHandler!({ exitCode: 1 })
      await vi.advanceTimersByTimeAsync(2000)

      // Second: trigger exit → recovery attempt 2
      ptyOnExitHandler!({ exitCode: 1 })
      await vi.advanceTimersByTimeAsync(4000)

      // Third: trigger exit → recovery attempt 3
      ptyOnExitHandler!({ exitCode: 1 })
      await vi.advanceTimersByTimeAsync(8000)

      // Now _autoRecoveryCount should be 3. Next exit should NOT trigger recovery.
      ;(pty.spawn as Mock).mockClear()
      mockDatabase.updateAgent.mockClear()

      ptyOnExitHandler!({ exitCode: 1 })

      // Advance well past any possible delay — no new spawn should happen
      await vi.advanceTimersByTimeAsync(20000)

      // The final exit should set status to 'error' without scheduling recovery
      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ status: 'error' })
      )
      // No new pty spawn after exhausting retries
      expect(pty.spawn).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // 3. User-initiated stop (isKilled) does NOT trigger recovery
  // =========================================================================
  describe('user-initiated stop (isKilled)', () => {
    it('does not trigger auto-recovery when session is stopped by user', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      await manager.startSession(agent)

      ;(pty.spawn as Mock).mockClear()

      // stopSession deletes from sessions map BEFORE pty.kill() triggers onExit
      manager.stopSession('agent-1')

      // onExit fires with non-zero code, but isKilled should be true
      // because the session was deleted from the map
      ptyOnExitHandler!({ exitCode: 1 })

      // Advance timers to ensure no recovery is scheduled
      await vi.advanceTimersByTimeAsync(10000)

      // No new pty spawn should happen
      expect(pty.spawn).not.toHaveBeenCalled()
    })

    it('does not trigger auto-recovery on clean exit (exitCode 0)', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      await manager.startSession(agent)

      ;(pty.spawn as Mock).mockClear()

      // Normal exit
      ptyOnExitHandler!({ exitCode: 0 })

      await vi.advanceTimersByTimeAsync(10000)

      // Status should be 'idle', not 'error'
      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ status: 'idle' })
      )
      expect(pty.spawn).not.toHaveBeenCalled()
    })

    it('sets status to idle on clean exit, error on crash', async () => {
      // Clean exit
      const agent1 = makeAgent({ id: 'agent-clean', claudeSessionId: 'sess-clean' })
      await manager.startSession(agent1)
      ptyOnExitHandler!({ exitCode: 0 })

      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-clean',
        expect.objectContaining({ status: 'idle' })
      )

      // Reset for crash test
      mockDatabase.updateAgent.mockClear()
      const agent2 = makeAgent({ id: 'agent-crash', claudeSessionId: 'sess-crash' })
      mockDatabase.getAgent.mockReturnValue(agent2)
      await manager.startSession(agent2)
      ptyOnExitHandler!({ exitCode: 1 })

      expect(mockDatabase.updateAgent).toHaveBeenCalledWith(
        'agent-crash',
        expect.objectContaining({ status: 'error' })
      )
    })
  })

  // =========================================================================
  // 4. Recovery counter resets on stable session
  // =========================================================================
  describe('recovery counter reset', () => {
    it('resets auto-recovery counter when session becomes active/thinking/tool_running', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)
      await manager.startSession(agent)

      // Simulate an exit + recovery
      ptyOnExitHandler!({ exitCode: 1 })
      await vi.advanceTimersByTimeAsync(2000)

      // Now recovered session is running. Simulate it becoming active via status detection.
      // Feed data that triggers tool_running status
      if (ptyOnDataHandler) {
        ptyOnDataHandler('Read(/some/file)')
      }

      // Now if it exits again, it should start recovery from count 0
      ;(pty.spawn as Mock).mockClear()
      ptyOnExitHandler!({ exitCode: 1 })

      // Should recover again (delay = 2000ms for attempt 1, not 4000ms)
      await vi.advanceTimersByTimeAsync(2000)
      expect(pty.spawn).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // 5. Scrollback is saved before recovery
  // =========================================================================
  describe('scrollback persistence during recovery', () => {
    it('saves scrollback to database on exit before recovery', async () => {
      const agent = makeAgent({ claudeSessionId: 'sess-1' })
      mockDatabase.getAgent.mockReturnValue(agent)
      await manager.startSession(agent)

      // Feed some data to populate scrollback
      if (ptyOnDataHandler) {
        ptyOnDataHandler('Some output data\n')
      }

      ptyOnExitHandler!({ exitCode: 1 })

      // saveAllScrollbacks should have been called with the agent's buffer
      expect(mockDatabase.saveAllScrollbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          'agent-1': expect.stringContaining('Some output data')
        })
      )
    })
  })
})
