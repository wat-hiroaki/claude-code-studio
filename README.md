# Claude Code Studio

> AI Agent Workspace Studio — Manage Claude Code CLI sessions like a team

[English](#english) | [Русский](#russian) | [日本語](#japanese)

---

<a id="english"></a>

## Overview

Claude Code Studio is an Electron desktop application for managing multiple Claude Code CLI sessions as an organization. It solves five pain points of working with Claude Code:

1. **Context contamination** — Workspaces provide strict isolation (MCP servers, API keys, guardrails) between company and personal projects
2. **Session management** — Bird's-eye dashboard for monitoring multiple concurrent agents
3. **Mobility** — SSH + tmux integration keeps sessions alive on remote servers when you leave your desk
4. **Input UX** — Rich Composer with templates, auto-expand, and voice-dictation-friendly input
5. **Ecosystem visibility** — Config Map and Agent Profile surface CLAUDE.md, Memory, Skills, MCP, and Hooks in one place

### Key Features

- **Workspace Isolation** — Local or SSH workspaces with per-workspace configuration
- **Real Terminal** — xterm.js + node-pty for true terminal rendering (not just chat bubbles)
- **SSH + tmux** — Connect to remote machines via SSH; sessions persist in tmux when disconnected
- **Agent Management** — Create, name, and organize agents with roles, teams, and projects
- **Composer** — Rich text input with prompt templates, Plan Mode toggle, keyboard shortcuts
- **Team Dashboard** — Real-time status monitoring (active, thinking, tool_running, awaiting, error)
- **Config Map** — Visual overview of CLAUDE.md hierarchy, MCP servers, hooks, skills, and memory per workspace — with per-host GLOBAL separation for SSH remotes
- **Activity Map** — Real-time agent activity visualization across local and SSH workspaces
- **Broadcast** — Send the same instruction to multiple agents simultaneously
- **Task Chains** — Automatically trigger Agent B when Agent A completes a task
- **Chain Graph & Scheduler** — Visualize chain dependencies and manage scheduled executions
- **Agent Profile** — Visualize CLAUDE.md rules, memory files, skills, MCP servers, and hooks
- **Multi-pane Layout** — 1, 2, or 4 terminal panes side by side with swap and close controls
- **Resizable Panels** — Drag to resize sidebar, terminal area, and context pane; layout persisted across restarts
- **Embedded Browser** — Browse web pages directly in the context pane
- **Session Recovery** — Terminal scrollback is saved and restored automatically
- **Diagnostics** — Built-in diagnostic logging for troubleshooting
- **Notifications** — Native OS notifications for approval requests and errors
- **System Tray** — Background operation with status indicator
- **Auto Update** — In-app update notifications and one-click install
- **Plugin System** — MCP-based plugins with manifest.json, toolbar buttons, and context tabs
- **i18n** — English, Japanese, Russian (README)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 + electron-vite |
| Terminal | xterm.js + node-pty |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui design tokens |
| State | Zustand |
| SSH | ssh2 + tmux |
| Layout | react-resizable-panels |
| Database | JSON file (atomic writes) |
| Build | electron-builder |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- For SSH workspaces: `tmux` and `claude` installed on the remote host

### Install & Run

```bash
git clone https://github.com/wat-hiroaki/claude-code-studio.git
cd claude-code-studio
npm install
npm run dev
```

### Build

```bash
# Windows installer
npm run package

# Development build only
npm run build
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Agent |
| `Ctrl+K` | Quick Search |
| `Ctrl+D` | Toggle Dashboard |
| `Ctrl+L` | Focus Composer |
| `Ctrl+Shift+B` | Broadcast Mode |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / Previous Agent |
| `Ctrl+1-9` | Switch to Agent #N |
| `Ctrl+Shift+P` | Toggle Right Pane |
| `Ctrl+W` | Archive Agent |
| `Ctrl+=` / `Ctrl+-` | Zoom In / Out (Terminal Font) |

## Architecture

```
src/
├── main/                        # Electron main process
│   ├── index.ts                 # App bootstrap (240 lines)
│   ├── appState.ts              # Module-scoped app flags (isQuitting)
│   ├── appLifecycle.ts          # App lifecycle events (quit, activate)
│   ├── windowManager.ts         # Window + tray creation
│   ├── sessionManager.ts        # Headless Claude CLI sessions
│   ├── ptySessionManager.ts     # Interactive PTY sessions (node-pty)
│   ├── sshSessionManager.ts     # SSH + tmux remote sessions
│   ├── ptyOutputParser.ts       # Status detection from terminal output
│   ├── chainOrchestrator.ts     # Task chain automation
│   ├── scheduler.ts             # Interval-based chain scheduling
│   ├── db/                      # Database layer (JSON file, atomic writes)
│   │   ├── database.ts
│   │   ├── agentQueries.ts
│   │   ├── workspaceQueries.ts
│   │   └── chainQueries.ts
│   ├── ipc/                     # IPC handlers (typed deps pattern)
│   │   ├── agentHandlers.ts
│   │   ├── sessionHandlers.ts
│   │   ├── workspaceHandlers.ts
│   │   ├── configHandlers.ts
│   │   └── systemHandlers.ts
│   ├── config/                  # Config file readers
│   └── plugins/                 # MCP-based plugin system
│       ├── pluginManager.ts
│       └── pluginIpcHandlers.ts
├── preload/                     # Context bridge (70+ IPC channels)
│   └── index.ts
├── renderer/                    # React 18 UI
│   └── src/
│       ├── components/          # UI components
│       ├── stores/              # Zustand state (useAppStore.ts)
│       ├── i18n/                # EN/JA translations
│       └── lib/                 # Utilities
└── shared/                      # Shared types (single source of truth)
    └── types.ts
```

## How It Works

### Workspace Model

Workspaces provide isolation between different contexts (company A, company B, personal). Each workspace can be:

- **Local** — Runs Claude Code on this machine via node-pty
- **SSH** — Connects to a remote host via ssh2, runs Claude Code inside tmux

### Config Map

The Config Map visualizes the complete configuration hierarchy for each workspace:

- **Organization Overview** — All workspaces with per-host GLOBAL nodes (local `~/.claude` and SSH remote `~/.claude` are correctly separated)
- **Detail View** — Drill down into CLAUDE.md rules, skills, commands, templates, MCP servers, hooks, memory, and agent definitions

### Session Lifecycle

1. Create a workspace (local or SSH with host/port/username)
2. Create an agent within the workspace (name, project path, role)
3. The terminal auto-connects when you select an agent
4. SSH sessions persist in tmux — disconnect and reconnect without losing state

### Status Detection

The app parses terminal output to detect Claude Code states:
- **Awaiting** — Permission prompts (Allow/Deny)
- **Thinking** — Spinner characters or "Thinking..."
- **Tool Running** — Read/Edit/Write/Bash/etc. tool execution
- **Active** — Idle at prompt

## Contributing

Issues and PRs welcome. Please follow existing code patterns.

## License

MIT - wat-hiroaki

---

<a id="japanese"></a>

## 概要

Claude Code Studio は、複数の Claude Code CLI セッションを組織として管理する Electron デスクトップアプリです。以下の5つの課題を解決します:

1. **コンテキスト汚染** — ワークスペースで会社/個人プロジェクトを完全分離
2. **セッション管理** — ダッシュボードで複数エージェントを一望
3. **モビリティ** — SSH + tmux でリモートセッション永続化
4. **入力UX** — テンプレート・Plan Mode切替付きの Composer
5. **エコシステム可視化** — Config Map と Agent Profile で CLAUDE.md, Memory, Skills, MCP, Hooks を一箇所で確認

### 主な機能

- **ワークスペース分離** — ローカル or SSH、プロジェクトごとに設定を分離
- **リアルターミナル** — xterm.js + node-pty による本物のターミナル表示
- **SSH + tmux** — リモートマシンに SSH 接続、切断しても tmux でセッション維持
- **エージェント管理** — 作成・命名・役割設定・チーム・プロジェクト紐付け
- **Composer** — テンプレート・Plan Mode・ショートカット付きリッチ入力
- **ダッシュボード** — 全エージェントのリアルタイムステータス監視
- **Config Map** — CLAUDE.md階層・MCP・Hooks・Skills・Memoryをワークスペース単位で可視化。SSHリモートのGLOBALをホスト別に正しく分離表示
- **アクティビティマップ** — ローカル/SSH横断のリアルタイムエージェント活動可視化
- **ブロードキャスト** — 複数エージェントへの一括指示
- **タスクチェーン** — A完了→B自動開始
- **チェーングラフ & スケジューラ** — チェーン依存関係の可視化・定期実行管理
- **Agent Profile** — CLAUDE.md・Memory・Skills・MCP・Hooks の可視化
- **マルチペイン** — 1/2/4 ターミナル並列表示、パネル入替え・閉じるボタン付き
- **リサイザブルパネル** — ドラッグでサイズ調整、レイアウト永続化
- **ブラウザ埋め込み** — コンテキストペイン内でウェブページを閲覧
- **セッション回復** — ターミナル出力を自動保存・復元
- **診断ログ** — トラブルシューティング用の内蔵診断機能
- **通知** — OS ネイティブ通知
- **自動アップデート** — アプリ内通知・ワンクリックインストール
- **多言語** — 英語・日本語

### 始め方

```bash
git clone https://github.com/wat-hiroaki/claude-code-studio.git
cd claude-code-studio
npm install
npm run dev
```

### ビルド

```bash
# Windows インストーラー
npm run package
```

## ライセンス

MIT - wat-hiroaki

---

<a id="russian"></a>

## Обзор

Claude Code Studio — десктопное Electron-приложение для управления несколькими сессиями Claude Code CLI как командой. Решает 5 проблем:

1. **Загрязнение контекста** — Воркспейсы изолируют конфигурации (MCP, API-ключи, ограничения) между проектами
2. **Управление сессиями** — Дашборд для мониторинга нескольких агентов одновременно
3. **Мобильность** — SSH + tmux сохраняют сессии на удалённых серверах
4. **UX ввода** — Composer с шаблонами, Plan Mode, горячие клавиши
5. **Видимость экосистемы** — Config Map и Agent Profile показывают CLAUDE.md, Memory, Skills, MCP, Hooks в одном месте

### Ключевые возможности

- **Изоляция воркспейсов** — Локальные или SSH, с конфигурацией на уровне проекта
- **Настоящий терминал** — xterm.js + node-pty (не чат-пузыри)
- **SSH + tmux** — Подключение к удалённым машинам, сессии живут в tmux
- **Управление агентами** — Создание, роли, команды, проекты
- **Плагины** — MCP-серверы с manifest.json, кнопки на тулбаре, вкладки контекста
- **Activity Map** — Визуализация активности агентов в реальном времени
- **Task Chains** — Автоматический запуск агента B при завершении агента A
- **Multi-pane Layout** — 1/2/4 терминала рядом, drag-to-split
- **Авто-обновление** — Уведомления + установка в один клик

### Быстрый старт

```bash
git clone https://github.com/Blysspeak/claude-code-studio.git
cd claude-code-studio
npm install
npm run dev
```

### Горячие клавиши

| Клавиши | Действие |
|---------|----------|
| `Ctrl+N` | Новый агент |
| `Ctrl+K` | Быстрый поиск |
| `Ctrl+D` | Дашборд |
| `Ctrl+L` | Фокус на Composer |
| `Ctrl+Tab` | Следующий агент |
| `Ctrl+Shift+P` | Правая панель |
| `Ctrl+=` / `Ctrl+-` | Масштаб шрифта терминала |

## Лицензия

MIT - wat-hiroaki
