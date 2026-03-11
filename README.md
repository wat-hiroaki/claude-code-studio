# Claude Code Desktop

> Multi-workspace AI Agent Management Client — Manage Claude Code CLI sessions like a team

[English](#english) | [日本語](#japanese)

---

<a id="english"></a>

## Overview

Claude Code Desktop is an Electron desktop application for managing multiple Claude Code CLI sessions. It solves five pain points of working with Claude Code:

1. **Context contamination** — Workspaces provide strict isolation (MCP servers, API keys, guardrails) between company and personal projects
2. **Session management** — Bird's-eye dashboard for monitoring multiple concurrent agents
3. **Mobility** — SSH + tmux integration keeps sessions alive on remote servers when you leave your desk
4. **Input UX** — Rich Composer with templates, auto-expand, and voice-dictation-friendly input
5. **Ecosystem visibility** — Agent Profile View surfaces CLAUDE.md, Memory, Skills, MCP, and Hooks in one place

### Key Features

- **Workspace Isolation** — Local or SSH workspaces with per-workspace configuration
- **Real Terminal** — xterm.js + node-pty for true terminal rendering (not just chat bubbles)
- **SSH + tmux** — Connect to remote machines via SSH; sessions persist in tmux when disconnected
- **Agent Management** — Create, name, and organize agents with roles and projects
- **Composer** — Rich text input with prompt templates, keyboard shortcuts, auto-expand
- **Team Dashboard** — Real-time status monitoring (active, thinking, tool_running, awaiting, error)
- **Broadcast** — Send the same instruction to multiple agents simultaneously
- **Task Chains** — Automatically trigger Agent B when Agent A completes a task
- **Agent Profile** — Visualize CLAUDE.md rules, memory files, skills, MCP servers, and hooks
- **Multi-pane Layout** — 1, 2, or 4 terminal panes side by side
- **Notifications** — Native OS notifications for approval requests and errors
- **System Tray** — Background operation with status indicator
- **i18n** — English and Japanese

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 + electron-vite |
| Terminal | xterm.js + node-pty |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui design tokens |
| State | Zustand |
| SSH | ssh2 + tmux |
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
git clone https://github.com/wat-hiroaki/claude-code-desktop.git
cd claude-code-desktop
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
| `Ctrl+Tab` | Next Agent |
| `Ctrl+Shift+Tab` | Previous Agent |
| `Ctrl+1-9` | Switch to Agent #N |
| `Ctrl+Shift+P` | Toggle Right Pane |
| `Ctrl+W` | Archive Agent |

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, IPC handlers, routing
│   ├── database.ts          # JSON file database (atomic writes)
│   ├── session-manager.ts   # Legacy stream-json CLI management
│   ├── pty-session-manager.ts   # Local PTY session management
│   ├── ssh-session-manager.ts   # SSH + tmux remote sessions
│   ├── chain-orchestrator.ts    # Task chain automation
│   ├── claude-config-reader.ts  # CLAUDE.md/Memory/Skills reader
│   └── workspace-scanner.ts     # Project directory scanner
├── preload/                 # Context bridge (secure IPC)
│   └── index.ts
├── renderer/                # React UI
│   └── src/
│       ├── components/      # UI components
│       │   ├── PtyTerminalView.tsx   # Terminal + header + session lifecycle
│       │   ├── XtermTerminal.tsx     # xterm.js wrapper
│       │   ├── Composer.tsx          # Rich text input
│       │   ├── AgentList.tsx         # Sidebar with workspace filtering
│       │   ├── AgentProfileView.tsx  # CLAUDE.md ecosystem viewer
│       │   ├── WorkspaceSwitcher.tsx # Workspace dropdown
│       │   ├── CreateWorkspaceDialog.tsx  # Local/SSH workspace creation
│       │   └── ...
│       ├── stores/          # Zustand state
│       ├── i18n/            # EN/JA translations
│       └── lib/             # Utilities
└── shared/                  # Shared types
    └── types.ts
```

## How It Works

### Workspace Model

Workspaces provide isolation between different contexts (company A, company B, personal). Each workspace can be:

- **Local** — Runs Claude Code on this machine via node-pty
- **SSH** — Connects to a remote host via ssh2, runs Claude Code inside tmux

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

Claude Code Desktop は、複数の Claude Code CLI セッションを管理する Electron デスクトップアプリです。以下の5つの課題を解決します:

1. **コンテキスト汚染** — ワークスペースで会社/個人プロジェクトを完全分離
2. **セッション管理** — ダッシュボードで複数エージェントを一望
3. **モビリティ** — SSH + tmux でリモートセッション永続化
4. **入力UX** — テンプレート・自動展開付きの Composer
5. **エコシステム可視化** — CLAUDE.md, Memory, Skills, MCP, Hooks を一箇所で確認

### 主な機能

- **ワークスペース分離** — ローカル or SSH、プロジェクトごとに設定を分離
- **リアルターミナル** — xterm.js + node-pty による本物のターミナル表示
- **SSH + tmux** — リモートマシンに SSH 接続、切断しても tmux でセッション維持
- **エージェント管理** — 作成・命名・役割設定・プロジェクト紐付け
- **Composer** — テンプレート・ショートカット・自動展開付きリッチ入力
- **ダッシュボード** — 全エージェントのリアルタイムステータス監視
- **ブロードキャスト** — 複数エージェントへの一括指示
- **タスクチェーン** — A完了→B自動開始
- **Agent Profile** — CLAUDE.md・Memory・Skills・MCP・Hooks の可視化
- **マルチペイン** — 1/2/4 ターミナル並列表示
- **通知** — OS ネイティブ通知
- **多言語** — 英語・日本語

### 始め方

```bash
git clone https://github.com/wat-hiroaki/claude-code-desktop.git
cd claude-code-desktop
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
