import { describe, it, expect } from 'vitest'
import { filterEnvForPlugin } from '../pluginEnvFilter'

describe('filterEnvForPlugin', () => {
  const mockEnv: NodeJS.ProcessEnv = {
    // Safe system vars
    PATH: '/usr/bin:/usr/local/bin',
    HOME: '/home/user',
    USER: 'testuser',
    SHELL: '/bin/zsh',
    TERM: 'xterm-256color',
    LANG: 'en_US.UTF-8',
    DISPLAY: ':0',
    XDG_RUNTIME_DIR: '/run/user/1000',
    NODE_ENV: 'development',

    // Sensitive — should be blocked
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    OPENAI_API_KEY: 'sk-openai-secret',
    GITHUB_TOKEN: 'ghp_xxxx',
    GH_TOKEN: 'ghp_yyyy',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
    AWS_SESSION_TOKEN: 'aws-session',
    DATABASE_URL: 'postgres://user:pass@host/db',
    PGPASSWORD: 'dbpass',
    REDIS_URL: 'redis://localhost',
    SSH_AUTH_SOCK: '/tmp/ssh-agent.sock',
    SSH_AGENT_PID: '12345',
    NPM_TOKEN: 'npm_xxxx',
    STRIPE_SECRET_KEY: 'sk_live_xxxx',
    DOCKER_AUTH_CONFIG: '{"auths":{}}',
    GOOGLE_API_KEY: 'AIza-xxxx',
    AZURE_CLIENT_SECRET: 'azure-secret',
    CONTEXT7_API_KEY: 'ctx7-key',
    BRAVE_API_KEY: 'brave-key',

    // Pattern-matched sensitive vars
    MY_APP_SECRET: 'secret-value',
    DB_PASSWORD: 'password123',
    PRIVATE_KEY_PATH: '/path/to/key',
    CUSTOM_AUTH_TOKEN: 'token-value',
    SOME_API_KEY: 'api-key-value',

    // Non-sensitive custom vars — should pass through
    MY_CUSTOM_VAR: 'hello',
    EDITOR: 'vim',
    COLORTERM: 'truecolor'
  }

  it('passes through safe system variables', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.PATH).toBe('/usr/bin:/usr/local/bin')
    expect(result.HOME).toBe('/home/user')
    expect(result.USER).toBe('testuser')
    expect(result.SHELL).toBe('/bin/zsh')
    expect(result.TERM).toBe('xterm-256color')
    expect(result.LANG).toBe('en_US.UTF-8')
    expect(result.DISPLAY).toBe(':0')
    expect(result.XDG_RUNTIME_DIR).toBe('/run/user/1000')
    expect(result.NODE_ENV).toBe('development')
  })

  it('blocks known sensitive API keys', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.ANTHROPIC_API_KEY).toBeUndefined()
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.GOOGLE_API_KEY).toBeUndefined()
    expect(result.AZURE_CLIENT_SECRET).toBeUndefined()
    expect(result.CONTEXT7_API_KEY).toBeUndefined()
    expect(result.BRAVE_API_KEY).toBeUndefined()
  })

  it('blocks GitHub/Git tokens', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.GITHUB_TOKEN).toBeUndefined()
    expect(result.GH_TOKEN).toBeUndefined()
  })

  it('blocks cloud credentials', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(result.AWS_SESSION_TOKEN).toBeUndefined()
  })

  it('blocks database credentials', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.DATABASE_URL).toBeUndefined()
    expect(result.PGPASSWORD).toBeUndefined()
    expect(result.REDIS_URL).toBeUndefined()
  })

  it('blocks SSH credentials', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.SSH_AUTH_SOCK).toBeUndefined()
    expect(result.SSH_AGENT_PID).toBeUndefined()
  })

  it('blocks package manager tokens', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.NPM_TOKEN).toBeUndefined()
  })

  it('blocks Docker credentials', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.DOCKER_AUTH_CONFIG).toBeUndefined()
  })

  it('blocks pattern-matched sensitive vars (*SECRET*, *PASSWORD*, etc.)', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.MY_APP_SECRET).toBeUndefined()
    expect(result.DB_PASSWORD).toBeUndefined()
    expect(result.PRIVATE_KEY_PATH).toBeUndefined()
    expect(result.CUSTOM_AUTH_TOKEN).toBeUndefined()
    expect(result.SOME_API_KEY).toBeUndefined()
    expect(result.STRIPE_SECRET_KEY).toBeUndefined()
  })

  it('passes through non-sensitive custom vars', () => {
    const result = filterEnvForPlugin(mockEnv)
    expect(result.MY_CUSTOM_VAR).toBe('hello')
    expect(result.EDITOR).toBe('vim')
    expect(result.COLORTERM).toBe('truecolor')
  })

  it('allows specific vars via pluginAllowlist', () => {
    const result = filterEnvForPlugin(mockEnv, ['ANTHROPIC_API_KEY', 'DATABASE_URL'])
    expect(result.ANTHROPIC_API_KEY).toBe('sk-ant-secret')
    expect(result.DATABASE_URL).toBe('postgres://user:pass@host/db')
    // Other sensitive vars still blocked
    expect(result.OPENAI_API_KEY).toBeUndefined()
    expect(result.GITHUB_TOKEN).toBeUndefined()
  })

  it('skips undefined values', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', EMPTY: undefined }
    const result = filterEnvForPlugin(env)
    expect(result.PATH).toBe('/usr/bin')
    expect('EMPTY' in result).toBe(false)
  })

  it('returns empty object for empty env', () => {
    const result = filterEnvForPlugin({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('blocks API_KEY variants without $ anchor (e.g. SOME_API_KEY_FILE)', () => {
    const env: NodeJS.ProcessEnv = {
      SOME_API_KEY_FILE: '/path/to/key',
      MY_API_KEY_PATH: '/another/path',
      API_KEY_ROTATION_DATE: '2026-01-01',
      PATH: '/usr/bin'
    }
    const result = filterEnvForPlugin(env)
    expect(result.SOME_API_KEY_FILE).toBeUndefined()
    expect(result.MY_API_KEY_PATH).toBeUndefined()
    expect(result.API_KEY_ROTATION_DATE).toBeUndefined()
    expect(result.PATH).toBe('/usr/bin')
  })
})
