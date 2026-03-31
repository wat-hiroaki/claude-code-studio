/**
 * Plugin Manager
 * Discovers, manages, and communicates with MCP-based plugins.
 */
import { spawn, execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'fs'
import { join, resolve, isAbsolute } from 'path'
import { homedir } from 'os'
import { app, dialog, BrowserWindow } from 'electron'
import type {
  PluginManifest,
  PluginInfo,
  PluginToolbarButton,
  PluginContextTab
} from '@shared/types'
import { filterEnvForPlugin } from './pluginEnvFilter'

interface McpConnection {
  process: ReturnType<typeof spawn>
  requestId: number
  pendingRequests: Map<
    number,
    { resolve: (val: unknown) => void; reject: (err: Error) => void }
  >
  outputBuffer: string
}

export class PluginManager {
  private plugins = new Map<string, { manifest: PluginManifest; status: PluginInfo['status'] }>()
  private connections = new Map<string, McpConnection>()

  constructor() {}

  /** Build the list of allowed absolute paths for plugin commands (platform-aware) */
  private static getAllowedPaths(): string[] {
    const home = homedir()
    const paths = [
      join(home, '.claude-code-studio', 'plugins'),
      join(home, '.local', 'bin')
    ]
    if (process.platform === 'win32') {
      paths.push(join(home, 'AppData', 'Local', 'Programs'))
      paths.push(join(home, 'AppData', 'Local', 'claude-code-studio', 'plugins'))
    }
    // Normalize separators for consistent startsWith comparison
    return paths.map((p) => p.replace(/\\/g, '/'))
  }

  /** Check if a resolved path starts with any allowed prefix */
  private static isPathAllowed(resolvedPath: string): boolean {
    const normalized = resolvedPath.replace(/\\/g, '/')
    return PluginManager.getAllowedPaths().some((allowed) => normalized.startsWith(allowed))
  }

  /** Validate that a plugin command path is safe (no traversal) */
  private validateCommand(manifest: PluginManifest): void {
    const cmd = manifest.mcp.command
    if (cmd.includes('..') || cmd.includes('~')) {
      throw new Error(`Unsafe plugin command path: ${cmd}`)
    }
    if (isAbsolute(cmd)) {
      const resolved = resolve(cmd)
      if (!PluginManager.isPathAllowed(resolved)) {
        try {
          const real = realpathSync(resolved)
          if (!PluginManager.isPathAllowed(real)) {
            throw new Error(`Plugin command outside allowed paths: ${cmd}`)
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message.startsWith('Plugin command outside')) {
            throw e
          }
          const code = (e as NodeJS.ErrnoException).code
          if (code === 'ENOENT') {
            throw new Error(`Plugin command path not found: ${cmd}`)
          }
          throw new Error(`Plugin command path validation failed (${code ?? 'unknown'}): ${cmd}`)
        }
      }
    }
  }

  /** Scan bundled and user plugin directories for manifest.json files */
  discover(): void {
    const dirs: string[] = []

    // Bundled plugins
    const bundledDir = app.isPackaged
      ? join(process.resourcesPath, 'plugins')
      : join(__dirname, '../../resources/plugins')
    if (existsSync(bundledDir)) dirs.push(bundledDir)

    // User-installed plugins
    const userDir = join(homedir(), '.claude-code-studio', 'plugins')
    if (existsSync(userDir)) dirs.push(userDir)

    for (const dir of dirs) {
      let entries: string[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch {
        continue
      }

      for (const entry of entries) {
        const manifestPath = join(dir, entry, 'manifest.json')
        if (!existsSync(manifestPath)) continue
        try {
          const raw = readFileSync(manifestPath, 'utf-8')
          const manifest: PluginManifest = JSON.parse(raw)
          const installed = this.isInstalled(manifest)
          this.plugins.set(manifest.id, {
            manifest,
            status: installed ? 'installed' : 'not_installed'
          })
        } catch {
          // skip malformed manifests
        }
      }
    }
  }

  /** Check if the plugin's binary is available */
  isInstalled(manifest: PluginManifest): boolean {
    const cmd = manifest.mcp.command

    // Check bundled path
    const bundledDir = app.isPackaged
      ? join(process.resourcesPath, 'plugins', manifest.id)
      : join(__dirname, '../../resources/plugins', manifest.id)
    const bundledBin = join(bundledDir, cmd)
    if (existsSync(bundledBin)) return true

    // Check ~/.local/bin/
    const localBin = join(homedir(), '.local', 'bin', cmd)
    if (existsSync(localBin)) return true

    // Check PATH (cross-platform)
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which'
      execFileSync(whichCmd, [cmd], { timeout: 2000, stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  /** Resolve the full path to the plugin's command */
  private resolveCommand(manifest: PluginManifest): string {
    const cmd = manifest.mcp.command

    // Check bundled path first
    const bundledDir = app.isPackaged
      ? join(process.resourcesPath, 'plugins', manifest.id)
      : join(__dirname, '../../resources/plugins', manifest.id)
    const bundledBin = join(bundledDir, cmd)
    if (existsSync(bundledBin)) return bundledBin

    // Check ~/.local/bin/
    const localBin = join(homedir(), '.local', 'bin', cmd)
    if (existsSync(localBin)) return localBin

    // Fall back to PATH
    return cmd
  }

  /** Start an MCP subprocess for a plugin */
  start(pluginId: string, extraEnvVars?: Record<string, string>): void {
    const entry = this.plugins.get(pluginId)
    if (!entry) throw new Error(`Plugin not found: ${pluginId}`)
    if (this.connections.has(pluginId)) return // already running

    this.validateCommand(entry.manifest)
    const command = this.resolveCommand(entry.manifest)
    const args = entry.manifest.mcp.args

    const filteredEnv = filterEnvForPlugin(process.env)
    const pluginEnv = extraEnvVars ? { ...filteredEnv, ...extraEnvVars } : filteredEnv

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: pluginEnv
    })

    const conn: McpConnection = {
      process: proc,
      requestId: 0,
      pendingRequests: new Map(),
      outputBuffer: ''
    }

    proc.stdout?.setEncoding('utf-8')
    proc.stdout?.on('data', (chunk: string) => {
      conn.outputBuffer += chunk
      const lines = conn.outputBuffer.split('\n')
      conn.outputBuffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const response = JSON.parse(line)
          if (response.id != null && conn.pendingRequests.has(response.id)) {
            const pending = conn.pendingRequests.get(response.id)!
            conn.pendingRequests.delete(response.id)
            if (response.error) {
              pending.reject(new Error(response.error.message || 'MCP error'))
            } else {
              pending.resolve(response.result)
            }
          }
        } catch {
          // ignore malformed lines
        }
      }
    })

    proc.on('exit', () => {
      // Reject all pending requests
      for (const [id, pending] of conn.pendingRequests) {
        pending.reject(new Error('MCP process exited'))
        conn.pendingRequests.delete(id)
      }
      this.connections.delete(pluginId)
      const plugin = this.plugins.get(pluginId)
      if (plugin) plugin.status = 'error'
    })

    proc.on('error', (err) => {
      console.error(`[PluginManager] Failed to start ${pluginId}:`, err.message)
      this.connections.delete(pluginId)
      const plugin = this.plugins.get(pluginId)
      if (plugin) plugin.status = 'error'
    })

    this.connections.set(pluginId, conn)
    entry.status = 'running'
  }

  /** Send a JSON-RPC tools/call request to a plugin */
  async callTool(
    pluginId: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const entry = this.plugins.get(pluginId)
    if (!entry) {
      throw new Error(`Unknown plugin: ${pluginId}`)
    }

    const declaredTools = entry.manifest.tools.map((t) => t.name)
    if (!declaredTools.includes(tool)) {
      throw new Error(`Tool "${tool}" is not declared by plugin "${pluginId}". Available: ${declaredTools.join(', ')}`)
    }

    const conn = this.connections.get(pluginId)
    if (!conn || !conn.process.stdin) {
      throw new Error(`Plugin ${pluginId} is not running`)
    }

    const id = ++conn.requestId
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: tool, arguments: args },
      id
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.pendingRequests.delete(id)
        reject(new Error('MCP request timeout'))
      }, 15000)

      conn.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout)
          resolve(val)
        },
        reject: (err) => {
          clearTimeout(timeout)
          reject(err)
        }
      })

      conn.process.stdin!.write(JSON.stringify(request) + '\n')
    })
  }

  /** Get all discovered plugins with their status */
  getPlugins(): PluginInfo[] {
    const result: PluginInfo[] = []
    for (const [id, entry] of this.plugins) {
      result.push({
        id,
        manifest: entry.manifest,
        status: this.connections.has(id) ? 'running' : entry.status
      })
    }
    return result
  }

  /** Aggregate toolbar buttons from all running plugins */
  getToolbarButtons(): PluginToolbarButton[] {
    const buttons: PluginToolbarButton[] = []
    for (const [pluginId, entry] of this.plugins) {
      if (!this.connections.has(pluginId)) continue
      for (const btn of entry.manifest.ui.toolbarButtons) {
        buttons.push({
          pluginId,
          id: btn.id,
          tool: btn.tool,
          icon: btn.icon,
          prompt: btn.prompt
        })
      }
    }
    return buttons
  }

  /** Aggregate context tabs from all running plugins */
  getContextTabs(): PluginContextTab[] {
    const tabs: PluginContextTab[] = []
    for (const [pluginId, entry] of this.plugins) {
      if (!this.connections.has(pluginId)) continue
      const tab = entry.manifest.ui.contextTab
      if (tab) {
        tabs.push({
          pluginId,
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
          component: tab.component
        })
      }
    }
    return tabs
  }

  /** Install a plugin by running its manifest.install.steps with user confirmation */
  async install(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId)
    if (!entry) throw new Error(`Plugin not found: ${pluginId}`)
    if (!entry.manifest.install) throw new Error(`Plugin ${pluginId} has no install steps`)

    const steps = entry.manifest.install.steps

    // Show commands to user and require explicit approval
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      title: `Install plugin: ${entry.manifest.name}`,
      message: `Plugin "${entry.manifest.name}" wants to run the following commands:`,
      detail: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      buttons: ['Cancel', 'Install'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }
    const parentWindow = BrowserWindow.getFocusedWindow()
    const { response } = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options)

    if (response !== 1) {
      throw new Error('Plugin installation cancelled by user')
    }

    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)

    for (const step of steps) {
      await execFileAsync('bash', ['-c', step], { timeout: 120000 })
    }

    entry.status = 'installed'
  }

  /** Kill all MCP subprocesses */
  stopAll(): void {
    for (const [pluginId, conn] of this.connections) {
      if (!conn.process.killed) {
        conn.process.kill()
      }
      for (const [, pending] of conn.pendingRequests) {
        pending.reject(new Error('Plugin manager shutting down'))
      }
      conn.pendingRequests.clear()
      const plugin = this.plugins.get(pluginId)
      if (plugin) plugin.status = 'installed'
    }
    this.connections.clear()
  }
}
