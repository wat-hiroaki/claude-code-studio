# Claude Code Desktop

> AI Agent Team Management Client — Manage Claude Code sessions like team members

[English](#english) | [日本語](#japanese)

---

<a id="english"></a>

## Overview

Claude Code Desktop is an Electron-based desktop application that lets you manage multiple Claude Code CLI sessions as "team members." Think of it as **LINE/Slack for your AI agents** — chat with individual agents, broadcast instructions to your whole team, and monitor everyone's status from a unified dashboard.

### Key Features

- **Agent Management** — Create, name, and organize Claude Code sessions with roles and projects
- **Chat UI** — LINE-style message bubbles for 1-on-1 conversations with each agent
- **Team Dashboard** — Bird's-eye view of all agents' statuses (active, thinking, error, etc.)
- **Broadcast** — Send the same instruction to multiple agents simultaneously
- **Task Chains** — Automatically trigger Agent B when Agent A completes a task
- **Notifications** — Native OS notifications for task completion, errors, and approval requests
- **System Tray** — Runs in background with status indicator
- **i18n** — English and Japanese support

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33+ |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui design tokens |
| State | Zustand |
| CLI Integration | child_process (stream-json) |
| Database | JSON file (atomic writes) |
| Build | electron-vite + electron-builder |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 10
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Install & Run

```bash
# Clone
git clone https://github.com/wat-hiroaki/claude-code-desktop.git
cd claude-code-desktop

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for Windows
npm run package
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Agent |
| `Ctrl+K` | Quick Search |
| `Ctrl+D` | Toggle Dashboard |
| `Ctrl+Shift+B` | Broadcast Mode |
| `Ctrl+Tab` | Next Agent |
| `Ctrl+B` | Toggle Left Pane |
| `Ctrl+Shift+P` | Toggle Right Pane |

## Architecture

```
src/
├── main/              # Electron main process
│   ├── index.ts       # App entry, IPC handlers, window management
│   ├── database.ts    # JSON file database layer
│   ├── session-manager.ts  # Claude CLI process management
│   └── chain-orchestrator.ts # Task chain automation
├── preload/           # Context bridge (secure IPC)
│   └── index.ts
├── renderer/          # React UI
│   └── src/
│       ├── components/  # UI components
│       ├── stores/      # Zustand stores
│       ├── i18n/        # Internationalization
│       └── lib/         # Utilities
└── shared/            # Shared types between main & renderer
    └── types.ts
```

## License

MIT - wat-hiroaki

---

<a id="japanese"></a>

## 概要

Claude Code Desktop は、複数の Claude Code CLI セッションを「チームメンバー」として管理できる Electron ベースのデスクトップアプリです。**AI エージェントのための LINE/Slack** — 個別チャット、一括指示、ダッシュボードでのステータス監視が可能です。

### 主な機能

- **エージェント管理** — Claude Code セッションの作成・命名・役割設定
- **チャット UI** — LINE 風メッセージバブルでのエージェントとの 1on1 会話
- **チームダッシュボード** — 全エージェントのステータスを俯瞰
- **ブロードキャスト** — 複数エージェントに同じ指示を同時送信
- **タスクチェーン** — エージェント A の完了をトリガーにエージェント B へ自動指示
- **通知** — タスク完了・エラー・承認待ちの OS ネイティブ通知
- **システムトレイ** — バックグラウンド常駐とステータスアイコン
- **多言語対応** — 英語・日本語

### 始め方

```bash
# クローン
git clone https://github.com/wat-hiroaki/claude-code-desktop.git
cd claude-code-desktop

# 依存関係のインストール
npm install

# 開発モードで実行
npm run dev

# Windows 向けビルド
npm run package
```

## ライセンス

MIT - wat-hiroaki
