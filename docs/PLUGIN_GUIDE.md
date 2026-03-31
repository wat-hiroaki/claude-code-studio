# Community Plugin Guide

Build MCP-based plugins for Claude Code Studio.

## Quick Start

1. Create a directory: `~/.claude-code-studio/plugins/my-plugin/`
2. Add a `manifest.json` (see below)
3. Implement an MCP server (stdin/stdout JSON-RPC)
4. Restart Claude Code Studio — plugin appears in the Plugin list

## Directory Structure

```
~/.claude-code-studio/plugins/
  my-plugin/
    manifest.json       # Required — plugin definition
    server.js           # Your MCP server entry point
    package.json        # Optional — for npm-based plugins
```

## manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "mcp": {
    "command": "node",
    "args": ["server.js"]
  },
  "tools": [
    {
      "name": "my_tool",
      "label": "My Tool",
      "icon": "save"
    }
  ],
  "ui": {
    "toolbarButtons": [
      {
        "id": "my-button",
        "tool": "my_tool",
        "icon": "save",
        "prompt": "Run my tool for {project}"
      }
    ],
    "contextTab": {
      "id": "my-tab",
      "label": "My Tab",
      "icon": "brain",
      "component": "MyPanel"
    }
  },
  "install": {
    "check": "node -e \"require('./server')\"",
    "steps": [
      "npm install"
    ]
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique plugin identifier (must match directory name) |
| `name` | Yes | Display name |
| `version` | Yes | Semver version |
| `description` | Yes | Short description |
| `author` | Yes | Author name |
| `mcp.command` | Yes | Command to start the MCP server |
| `mcp.args` | Yes | Arguments for the command |
| `tools` | Yes | List of tools the plugin provides |
| `tools[].name` | Yes | Tool name (used in MCP calls) |
| `tools[].label` | Yes | Display label |
| `tools[].icon` | Yes | Icon name from lucide-react |
| `ui.toolbarButtons` | No | Buttons shown in pane toolbar |
| `ui.toolbarButtons[].prompt` | No | Template sent to agent (`{project}` is replaced) |
| `ui.contextTab` | No | Tab shown in the right context pane |
| `install.check` | No | Command to check if dependencies are installed |
| `install.steps` | No | Shell commands to install dependencies (shown to user for approval) |

## MCP Server Protocol

Plugins communicate via JSON-RPC 2.0 over stdin/stdout. Claude Code Studio sends tool calls and expects responses.

### Request (Studio -> Plugin)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "my_tool",
    "arguments": { "query": "hello" }
  }
}
```

### Response (Plugin -> Studio)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "Result here" }
    ]
  }
}
```

### Minimal Node.js Server Example

```javascript
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line)
    const { id, method, params } = request

    if (method === 'tools/call') {
      const result = handleTool(params.name, params.arguments)
      const response = JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: result }] }
      })
      process.stdout.write(response + '\n')
    }
  } catch (err) {
    // Errors on stderr (not sent to Studio)
    process.stderr.write(`Error: ${err.message}\n`)
  }
})

function handleTool(name, args) {
  switch (name) {
    case 'my_tool':
      return `Processed: ${JSON.stringify(args)}`
    default:
      return `Unknown tool: ${name}`
  }
}
```

## Security

- **Install steps require user approval** — A confirmation dialog shows all commands before execution
- **Tool calls are validated** — Only tools declared in `manifest.json` can be called
- **Environment is sanitized** — Sensitive environment variables (API keys, tokens, secrets) are filtered out before plugin processes start
- **Command paths are validated** — Path traversal (`..`, `~`) is rejected; absolute paths must resolve to `~/.local/bin/` or `~/.claude-code-studio/plugins/`
- **Process isolation** — Each plugin runs as a separate subprocess; crashes don't affect other plugins or the main app
- **No webview access** — Plugins communicate exclusively via MCP (stdin/stdout JSON-RPC), not via the Electron renderer. The `webviewTag: true` setting is used solely for the built-in Browser panel

### Blocked Environment Variables

The following are automatically filtered from plugin processes:

- API keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GH_TOKEN`, etc.
- Cloud credentials: `AWS_SECRET_ACCESS_KEY`, `AZURE_CLIENT_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS`
- Database: `DATABASE_URL`, `PGPASSWORD`, `REDIS_URL`, `MONGO_URI`
- SSH: `SSH_AUTH_SOCK`, `SSH_AGENT_PID`
- Any variable matching: `*SECRET*`, `*PASSWORD*`, `*PRIVATE_KEY*`, `*AUTH_TOKEN*`, `*API_KEY`

System variables (`PATH`, `HOME`, `TERM`, `LANG`, `DISPLAY`, `XDG_*`) are always passed through.

If your plugin requires a specific variable, it can be configured via per-plugin env var settings (planned)

## Available Icons

Icons come from [lucide-react](https://lucide.dev/icons). Common choices:
`save`, `book-open`, `brain`, `search`, `database`, `terminal`, `code`, `file-text`, `settings`, `zap`

## Tips

- Test your MCP server standalone first: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"my_tool","arguments":{}}}' | node server.js`
- Plugin processes are started on-demand and stopped when the app closes
- Use `stderr` for debug logging (not visible to Studio)
- Toolbar button `prompt` supports `{project}` placeholder for the active agent's project name
