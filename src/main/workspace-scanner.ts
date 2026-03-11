import { readdir, stat, readFile, access } from 'fs/promises'
import { join, basename } from 'path'
import type { DiscoveredWorkspace } from '@shared/types'

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out',
  '.cache', '.turbo', '.vercel', '.output', 'coverage',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode'
])

const MAX_DEPTH = 5
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
      const s = await stat(dirPath)
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
      const s = await stat(fullPath)
      if (s.isDirectory()) {
        await scanDirectory(fullPath, depth + 1, results)
      }
    } catch { /* permission denied etc */ }
  }
}

export async function scanWorkspaces(rootPath: string): Promise<DiscoveredWorkspace[]> {
  // Also scan ~/.claude for global config
  const results: DiscoveredWorkspace[] = []

  // Check if the .claude global directory exists
  const userHome = process.env.HOME || process.env.USERPROFILE || ''
  const globalClaudeDir = join(userHome, '.claude')
  if (await fileExists(globalClaudeDir)) {
    const globalClaude = join(userHome, 'CLAUDE.md')
    const hasGlobalMd = await fileExists(globalClaude)

    results.push({
      path: globalClaudeDir.replace(/\\/g, '/'),
      name: '~/.claude (Global Config)',
      detectedFiles: {
        claudeMd: hasGlobalMd,
        claudeDir: true,
        agentsMd: false,
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
