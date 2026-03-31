/**
 * Environment variable filtering for plugin subprocesses.
 * Prevents leaking sensitive credentials to third-party plugins.
 */

/** Env var names that are always blocked from plugin processes */
const SENSITIVE_ENV_DENYLIST = new Set([
  // API keys
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'AZURE_API_KEY',
  'COHERE_API_KEY',
  'HUGGINGFACE_TOKEN',
  'HF_TOKEN',

  // Cloud credentials
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AZURE_CLIENT_SECRET',

  // Git/GitHub
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'BITBUCKET_TOKEN',

  // SSH
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',

  // Package managers
  'NPM_TOKEN',
  'YARN_TOKEN',
  'CARGO_REGISTRY_TOKEN',
  'PIP_TOKEN',

  // Database
  'DATABASE_URL',
  'PGPASSWORD',
  'MYSQL_PWD',
  'REDIS_URL',
  'MONGO_URI',
  'MONGODB_URI',

  // Docker
  'DOCKER_AUTH_CONFIG',
  'DOCKER_PASSWORD',

  // Misc
  'STRIPE_SECRET_KEY',
  'SENDGRID_API_KEY',
  'TWILIO_AUTH_TOKEN',
  'SLACK_TOKEN',
  'DISCORD_TOKEN',

  // Brave / Context7 (user-specific)
  'BRAVE_API_KEY',
  'CONTEXT7_API_KEY'
])

/** Patterns that match sensitive env var names (case-insensitive) */
const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /private.?key/i,
  /auth.?token/i,
  /api.?key/i,
  /credentials/i,
  /access.?key/i
]

/** Env vars that are always safe to pass through */
const SAFE_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_RUNTIME_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'NODE_ENV',
  'ELECTRON_RUN_AS_NODE'
])

function isSensitive(key: string): boolean {
  if (SENSITIVE_ENV_DENYLIST.has(key)) return true
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))
}

/**
 * Filter process.env for a plugin subprocess.
 * Blocks sensitive vars by default, allows safe system vars through.
 *
 * @param env - The full process.env object
 * @param pluginAllowlist - Optional list of extra env var names the plugin is allowed to see
 * @returns Filtered env object safe for plugin subprocess
 */
export function filterEnvForPlugin(
  env: NodeJS.ProcessEnv,
  pluginAllowlist: string[] = []
): NodeJS.ProcessEnv {
  const allowSet = new Set(pluginAllowlist)
  const filtered: NodeJS.ProcessEnv = {}

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue

    // Explicitly allowed by plugin config — always pass through
    if (allowSet.has(key)) {
      filtered[key] = value
      continue
    }

    // Always safe
    if (SAFE_ALLOWLIST.has(key)) {
      filtered[key] = value
      continue
    }

    // Block sensitive vars
    if (isSensitive(key)) continue

    // Pass through everything else
    filtered[key] = value
  }

  return filtered
}
