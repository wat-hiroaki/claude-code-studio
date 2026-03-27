# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Dev with HMR (electron-vite dev)
npm run build        # Production build (electron-vite build)
npm run lint         # ESLint (.ts,.tsx)
npm run lint:fix     # ESLint with auto-fix
npx tsc --noEmit     # TypeScript type check (no emit)
npm run package      # Windows installer
npm run package:all  # Windows + Mac + Linux
```

## Architecture

Electron app (main + preload + renderer) built with `electron-vite`.

- **Main process** (`src/main/`) — Node.js: IPC handlers, database, session managers, plugins
- **Preload** (`src/preload/index.ts`) — Secure bridge: 70+ IPC channels exposed via `contextBridge`
- **Renderer** (`src/renderer/src/`) — React 18 + Tailwind CSS + Zustand
- **Shared types** (`src/shared/types.ts`) — Single source of truth for all cross-process types

### IPC Pattern

Renderer calls `window.api.method()` → preload's `ipcRenderer.invoke()` → main's `ipcMain.handle()`. All IPC handlers are in `src/main/ipc/` and receive a typed `deps` object. All inputs validated in main process before execution.

### Three Session Managers

| Manager | Transport | Use case |
|---------|-----------|----------|
| `SessionManager` | `spawn()` + stream-JSON | Headless/API sessions |
| `PtySessionManager` | `node-pty` | Interactive terminal (xterm.js) |
| `SshSessionManager` | `ssh2` + tmux | Remote persistent sessions |

`PtySessionManager` is the primary mode. It spawns Claude CLI with `--session-id --verbose` and detects status (thinking, tool_running, awaiting, active) by parsing terminal output in `ptyOutputParser.ts`.

### Database

JSON file at `{userData}/claude-code-studio/database.json`. Atomic writes with dirty flag + debounced save. Query modules in `src/main/db/` (agentQueries, workspaceQueries, chainQueries, etc.).

### Plugin System

Plugins are MCP servers discovered from `~/.claude-code-studio/plugins/{id}/manifest.json`. Each manifest declares tools, toolbar buttons, and context tabs. Plugin install requires user confirmation via dialog before executing any shell commands.

### Task Chains & Automation

`ChainOrchestrator` evaluates trigger rules (complete/keyword/no_error/scheduled) on agent status changes. `ChainScheduler` handles interval-based execution. Chains support `{prev_result}` template substitution.

### State Management

Single Zustand store (`src/renderer/src/stores/useAppStore.ts`) holds agents, messages, UI state, layout tree, workspace data, and theme.

### Path Aliases

**Main/Preload**: `@shared` → `src/shared`, `@main` → `src/main`
**Renderer**: `@components`, `@stores`, `@lib`, `@hooks`, `@appTypes` → corresponding `src/renderer/src/` subdirs

## Conventions

- **Named exports only** — no default exports
- **i18n**: `useTranslation()` for all UI text. Locales: `src/renderer/src/i18n/locales/{en,ja}.json`. Add keys to BOTH files.
- **Styling**: `cn()` from `@lib/utils` for conditional Tailwind classes. Icons from `lucide-react`.
- **Lint rules**: `@typescript-eslint/no-explicit-any` is **error**. Unused vars with `^_` prefix are allowed. No `require()` — use dynamic `import()` for lazy loading.
- **App quit flag**: Use `isAppQuitting()`/`setAppQuitting()` from `@main/appState` (not `app as any`).
- **Security**: `validateProjectPath()` prevents path traversal. Plugin installs show commands to user via dialog before execution. Plugin tool calls validated against manifest.
