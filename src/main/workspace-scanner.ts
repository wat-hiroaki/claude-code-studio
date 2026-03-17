import { readdir, lstat, readFile, access } from 'fs/promises'
import { join, basename } from 'path'
import type { DiscoveredWorkspace } from '@shared/types'

// Directories to never recurse into
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out',
  '.cache', '.turbo', '.vercel', '.output', 'coverage',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode',
  // Windows system/app folders (huge, no Claude projects)
  'AppData', 'Application Data', 'Local Settings',
  'Cookies', 'NetHood', 'PrintHood', 'Recent', 'SendTo',
  'Templates', 'My Documents', 'Saved Games', 'Searches',
  'Favorites', 'Links', 'Contacts', 'Music', 'Pictures',
  'Videos', 'OneDrive', 'Downloads', 'npm-cache',
  // macOS
  'Library', 'Applications'
])

const MAX_DEPTH = 4
const CLAUDE_MD_PREVIEW_LINES = 5

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readPreview(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n').slice(0, CLAUDE_MD_PREVIEW_LINES)
    return lines.join('\n').trim() || null
  } catch {
    return null
  }
}

function extractTechStack(packageJson: Record<string, unknown>): string[] {
  const stack: string[] = []
  const deps = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined)
  }

  const markers: [string, string][] = [
    ['next', 'Next.js'],
    ['react', 'React'],
    ['vue', 'Vue'],
    ['svelte', 'Svelte'],
    ['angular', 'Angular'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['tailwindcss', 'Tailwind CSS'],
    ['typescript', 'TypeScript'],
    ['prisma', 'Prisma'],
    ['@supabase/supabase-js', 'Supabase'],
    ['drizzle-orm', 'Drizzle'],
    ['electron', 'Electron'],
    ['vite', 'Vite'],
    ['vitest', 'Vitest'],
    ['jest', 'Jest'],
    ['@trpc/server', 'tRPC']
  ]

  for (const [pkg, label] of markers) {
    if (deps[pkg]) stack.push(label)
  }

  return stack
}

async function scanDirectory(
  dirPath: string,
  depth: number,
  results: DiscoveredWorkspace[]
): Promise<void> {
  if (depth > MAX_DEPTH) return

  let entries: string[]
  try {
    entries = await readdir(dirPath)
  } catch {
    return
  }

  const hasClaude = entries.includes('CLAUDE.md')
  const hasClaudeDir = entries.includes('.claude')
  const hasAgentsMd = entries.includes('AGENTS.md')
  const hasPkgJson = entries.includes('package.json')

  // This directory is a workspace if it has any Claude-related file
  if (hasClaude || hasClaudeDir || hasAgentsMd) {
    let name = basename(dirPath)
    let techStack: string[] = []
    let claudeMdPreview: string | null = null

    if (hasPkgJson) {
      try {
        const raw = await readFile(join(dirPath, 'package.json'), 'utf-8')
        const pkg = JSON.parse(raw) as Record<string, unknown>
        if (typeof pkg.name === 'string' && pkg.name) name = pkg.name
        techStack = extractTechStack(pkg)
      } catch { /* ignore parse errors */ }
    }

    if (hasClaude) {
      claudeMdPreview = await readPreview(join(dirPath, 'CLAUDE.md'))
    }

    let lastModified = new Date().toISOString()
    try {
      const s = await lstat(dirPath)
      lastModified = s.mtime.toISOString()
    } catch { /* ignore */ }

    results.push({
      path: dirPath.replace(/\\/g, '/'),
      name,
      detectedFiles: {
        claudeMd: hasClaude,
        claudeDir: hasClaudeDir,
        agentsMd: hasAgentsMd,
        packageJson: hasPkgJson
      },
      claudeMdPreview,
      techStack,
      lastModified
    })
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
    const fullPath = join(dirPath, entry)
    try {
      const s = await lstat(fullPath)
      // Skip symlinks entirely to avoid EPERM and loops
      if (s.isSymbolicLink()) continue
      if (s.isDirectory()) {
        await scanDirectory(fullPath, depth + 1, results)
      }
    } catch { /* permission denied etc */ }
  }
}

export async function scanWorkspaces(rootPath: string): Promise<DiscoveredWorkspace[]> {
  const results: DiscoveredWorkspace[] = []

  // Check if the .claude global directory exists
  const userHome = process.env.HOME || process.env.USERPROFILE || ''
  const globalClaudeDir = join(userHome, '.claude')
  if (await fileExists(globalClaudeDir)) {
    const globalClaude = join(userHome, 'CLAUDE.md')
    const hasGlobalMd = await fileExists(globalClaude)
    const hasGlobalAgents = await fileExists(join(userHome, 'AGENTS.md'))

    results.push({
      path: userHome.replace(/\\/g, '/'),
      name: '~/ (Global Config)',
      detectedFiles: {
        claudeMd: hasGlobalMd,
        claudeDir: true,
        agentsMd: hasGlobalAgents,
        packageJson: false
      },
      claudeMdPreview: hasGlobalMd ? await readPreview(globalClaude) : null,
      techStack: [],
      lastModified: new Date().toISOString()
    })
  }

  await scanDirectory(rootPath, 0, results)
  return results
}

/**
 * Scan remote directories via SSH for Claude Code workspaces.
 * Uses `find` command over SSH to detect .claude/, CLAUDE.md, AGENTS.md
 */
export async function scanRemoteWorkspaces(
  sshConfig: { host: string; port: number; username: string; privateKeyPath?: string },
  rootPath: string
): Promise<DiscoveredWorkspace[]> {
  const { Client } = await import('ssh2')
  const { readFileSync } = await import('fs')

  return new Promise((resolve, reject) => {
    const client = new Client()
    const connectConfig: Record<string, unknown> = {
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.username,
      readyTimeout: 15000
    }

    if (sshConfig.privateKeyPath) {
      try {
        connectConfig.privateKey = readFileSync(sshConfig.privateKeyPath.replace(/\\/g, '/'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        reject(new Error(`Cannot read SSH key: ${sshConfig.privateKeyPath} (${msg})`))
        return
      }
    }

    client.on('ready', () => {
      // Use find to detect CLAUDE.md, .claude dirs, and AGENTS.md up to depth 4
      const cmd = [
        `find "${rootPath}" -maxdepth 4 \\(`,
        `-name "CLAUDE.md" -o -name ".claude" -o -name "AGENTS.md" -o -name "package.json"`,
        `\\) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null`
      ].join(' ')

      client.exec(cmd, (err, stream) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        let output = ''
        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })
        stream.on('close', () => {
          client.end()

          const files = output.trim().split('\n').filter(Boolean)
          const dirMap = new Map<string, {
            claudeMd: boolean; claudeDir: boolean; agentsMd: boolean; packageJson: boolean
          }>()

          for (const filePath of files) {
            // Get the parent directory of each detected file
            const parts = filePath.split('/')
            const fileName = parts.pop() || ''
            const dirPath = parts.join('/')

            if (!dirMap.has(dirPath)) {
              dirMap.set(dirPath, { claudeMd: false, claudeDir: false, agentsMd: false, packageJson: false })
            }
            const entry = dirMap.get(dirPath)!

            if (fileName === 'CLAUDE.md') entry.claudeMd = true
            else if (fileName === '.claude') entry.claudeDir = true
            else if (fileName === 'AGENTS.md') entry.agentsMd = true
            else if (fileName === 'package.json') entry.packageJson = true
          }

          const results: DiscoveredWorkspace[] = []
          for (const [dirPath, detected] of dirMap) {
            // Only include directories that have Claude-related files
            if (!detected.claudeMd && !detected.claudeDir && !detected.agentsMd) continue

            const name = dirPath.split('/').pop() || dirPath
            results.push({
              path: dirPath,
              name,
              detectedFiles: detected,
              claudeMdPreview: null, // Remote preview not supported yet
              techStack: [],
              lastModified: new Date().toISOString()
            })
          }

          resolve(results)
        })
        stream.stderr.on('data', () => { /* ignore stderr */ })
      })
    })

    client.on('error', (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`))
    })

    client.connect(connectConfig)
  })
}

