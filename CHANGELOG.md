# Changelog

All notable changes to Claude Code Studio will be documented in this file.

## [0.8.3] - 2026-03-27

### Security
- Plugin install now requires user confirmation via dialog before executing shell commands
- `plugin:call` IPC validates pluginId and tool against manifest declarations
- Replaced `(app as any).isQuitting` with typed `appState.ts` module

### Changed
- Aurelius plugin unbundled — now installable as community plugin in `~/.claude-code-studio/plugins/`
- `require()` calls replaced with dynamic `import()` for ESLint compliance
- `SessionManager.claudePath` changed from `private` to `readonly`
- BrowserPanel (webview) lazy-mounted instead of always-on

### Fixed
- **Linux SIGSEGV crash** — root cause: cursor theme causing infinite recursion in Chromium GPU process. Fix: force Adwaita cursor + `disable-gpu-compositing`
- **Linux titlebar** — `titleBarOverlay` disabled on Linux (caused "overlay not enabled" crash), using `frame: true` for WM compatibility
- **Linux white screen** — `backgroundThrottling: false` + `visibilitychange` repaint handler prevents blank screen after desktop switch
- All 24 ESLint errors and warnings resolved (0 problems)
- Unused imports and variables cleaned up across 8 files

### Added
- `appState.ts` module with `isAppQuitting()`/`setAppQuitting()` helpers
- Russian section in README.md
- Plugin System listed in README features

### Docs
- CLAUDE.md fully rewritten with architecture, IPC patterns, conventions, build commands

## [0.8.2] - 2026-03-20

### Added
- MCP-based plugin system with manifest.json, toolbar buttons, and context tabs
- Free split layout with drag-to-split panes
- Aurelius knowledge graph integration (now community plugin)
- Full codebase refactoring — main/index.ts reduced from 1534 to 240 lines
- Path aliases (`@components/`, `@stores/`, `@lib/`, `@hooks/`, `@appTypes/`)

## [0.8.1] - 2026-03-13

### Fixed
- Linux: `window.confirm()` freeze on Wayland
- Linux: ANSI escape code leaking into UI
- SSH agent status detection not updating in sidebar
- PTY session not killed when switching to Dashboard

### Added
- Workspace refactored to support multiple projects (grouping concept)
