# Changelog

All notable changes to Claude Code Studio will be documented in this file.

## [v0.9.1] - 2026-03-29

### Security
- Modular env filtering for plugin subprocesses — denylist of ~50 sensitive vars + pattern matching (2665166)
- Command path validation prevents traversal attacks in plugin manifests (2665166)

### Added
- Russian language support (i18n) (12deaeb)
- Split pane buttons and sidebar collapse toggle (652ad90)
- Composer UX improvements — expand toggle, drag handle, line/char count (84e2296)
- Notes pad replaces Inbox tab in right pane (7354643)
- Collapsible left sidebar with Ctrl+B shortcut (21f7363)
- Drag-and-drop between panes via toolbar handle (757984a)

### Fixed
- Preserve claudeSessionId across app restarts for session recovery (f4a3a57)
- Japanese input and multiline text with bracketed paste (21ed2f1)
- Remove bottom gap in ActivityMap/ConfigMap, responsive stats cards (a886cf2)

### Documentation
- Screenshots added to README (be103b8)
- Plugin guide with security section expanded (2665166)
- CHANGELOG.md, Phase 4-6 roadmap in PRODUCT_VISION.md (122d6d5, 9570938)

### Tests
- Unit tests for plugin env filtering — 13 tests (b1b1e8e)

## [0.8.4] - 2026-03-28

### Fixed
- **SSH+tmux session reconnection** — Reconnecting after SSH disconnect (sleep, network drop) now properly resumes sessions. Detects whether claude is alive in tmux via `pane_current_command`; if dead, restarts with `claude --continue` to preserve conversation context
- **TitleBar overlay padding** — Platform-aware padding: `pr-[140px]` on Windows (right-side controls), `pl-[80px]` on macOS (left-side traffic lights), none on Linux. Fixed P0 bug where `getPlatform()` was called as async (`.then()` on sync string) causing padding to never apply
- **Linux repaint logic** — Restored `webContents.invalidate()` for compositor-level repaint on tiling WMs; guarded renderer-side CSS repaint hack to Linux only, avoiding unnecessary reflows on Windows/macOS
- **README clone URL** — Fixed Russian section pointing to wrong repository

### Changed
- tmux `new-session` now auto-starts claude CLI (previously only started in non-tmux fallback)

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
