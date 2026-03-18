# Claude Code Studio — Product Vision

> AI Agent Workspace Manager
> Claude Code を本気で使う人のための、マルチワークスペース管理ツール

## Problem Statement

Claude Code のパワーユーザーほど、以下の管理が破綻する：

| # | Pain | Current Workaround | Why It Fails |
|---|------|--------------------|--------------|
| 1 | 会社用/個人用のコンテキスト汚染 | 物理的に別マシンで運用 | 管理が二重、切替が面倒 |
| 2 | 複数セッションの俯瞰ができない | ターミナルタブを並べる | 名前もステータスも不明 |
| 3 | セッション切断で会話が消える | 諦める / tmux手動設定 | 設定コストが高い |
| 4 | 外出時にエージェントが終わらない | 待つか中断 | Wi-Fi切断 = セッション死亡 |

**Root cause**: Claude Code にはワークスペース（コンテキスト分離単位）という概念がなく、ローカル実行前提のため、管理・永続化・リモート操作すべてが自己責任になる。

## Target Persona

- スタートアップ CEO 兼エンジニア
- 会社プロダクトと個人プロジェクトの両方で Claude Code をヘビーに使う
- MCP、APIキー、ガードレールを用途ごとに厳密に分離したい
- 複数エージェント（CPO、エンジニア、RedTeam 等）をチーム運用している
- 移動が多く、出先からもエージェントの状態を確認・操作したい

## Core Concepts

```
Workspace（Company-A / Personal / ...）
├── Connection: local | ssh://<host>
├── Isolation: MCP config, API keys, env vars（workspace-scoped）
├── Guardrails: CLAUDE.md, hooks, permissions
└── Agents[]
    ├── Role, Skills, Project path
    └── Session（persistent, reconnectable）
```

### Concept Definitions

| Concept | Description |
|---------|-------------|
| **Workspace** | コンテキスト分離の単位。会社/個人など。認証・MCP・ガードレールのセットを持つ |
| **Agent** | ワークスペース内の実行者。役割・スキル・対象プロジェクトが紐づく |
| **Session** | エージェントの実行中CLIインスタンス。永続化され、再接続可能 |
| **Connection** | ローカル（spawn）またはリモート（SSH）への接続方法 |

## Architecture

### Execution Model

```
[Remote / Always-on Machine]
  └── tmux session
       └── claude -p --stream-json ...
            ↑ persists even if client disconnects

[Claude Code Studio (Electron)]
  └── SSH connection → attach to tmux session
       └── View terminal output + send input
```

- **Local mode**: 従来通り spawn で直接起動（軽量用途向け）
- **Remote mode**: SSH 経由で接続。セッションは tmux で永続化。クライアント切断に耐える

### App Roles

| Role | Description |
|------|-------------|
| **Viewer** | 全ワークスペース・全エージェントを LINE 風サイドバーで俯瞰 |
| **Controller** | エージェントへの指示送信、起動・停止、ブロードキャスト |
| **Config Manager** | ワークスペースごとの MCP・キー・ガードレールの可視化と編集 |
| **Connection Hub** | ローカル/リモートを透過的に扱う統一インターフェース |

## UI Concept

```
┌──────────────────────────────────────────────────────────┐
│ [Company-A ▼]              Claude Code Studio           │
├──────────────┬───────────────────────────────────────────┤
│ Sidebar      │  Terminal Area                             │
│              │  ┌───────────────────────────────────┐    │
│ 🟢 CPO       │  │ xterm.js (display + direct input) │    │
│  "build完了"  │  │                                   │    │
│  2m ago      │  │ $ claude                          │    │
│              │  │ > Running lint...                  │    │
│ 🔄 Engineer  │  │ > ✓ 0 errors                     │    │
│  "lint中..."  │  │ > Thinking...                     │    │
│  now         │  │                                   │    │
│              │  │                                   │    │
│ ⏸ RedTeam   │  └───────────────────────────────────┘    │
│  "idle"      │                                           │
│              │  Composer (Rich Input Area)                │
│              │  ┌───────────────────────────────────┐    │
│              │  │ ここにAPIエンドポイントを追加して   │    │
│              │  │ ほしいんだけど、認証はJWTで、      │    │
│              │  │ レート制限も入れてください         │    │
│              │  └───────────────────────────────────┘    │
│              │  [Send ⌘↵]  [Clear]  [Template ▼]  [⇅]   │
├──────────────┤───────────────────────────────────────────│
│ ⚙ Settings   │                                           │
│ 📊 Dashboard │                                           │
└──────────────┴───────────────────────────────────────────┘
```

- **Sidebar**: LINE 風 — 各エージェントの最新メッセージ、ステータスアイコン、経過時間
- **Terminal Area**: xterm.js によるリアルターミナル表示（CLI 体験そのまま、直接入力も可能）
- **Workspace Switcher**: 左上のドロップダウンでワークスペース切替（コンテキスト完全分離）

### Composer (Rich Input Area)

ターミナルの入力体験を補完する、テキストエディタ型の入力エリア。
ターミナルの直接入力では困難な「長文プロンプトの作成・編集」を解決する。

**背景 — ターミナル入力の課題:**
- 音声入力との相性が悪い（改行・特殊文字の意図しない送信）
- 複数行の編集がしづらい（行の追加・削除・並び替え）
- 長文を書くとき、わざわざメモ帳にコピーして編集→貼り付けが必要

**Composer の機能:**

| 機能 | 説明 |
|------|------|
| 複数行テキスト編集 | textarea ベース。自由にカーソル移動・範囲選択・改行挿入 |
| 音声入力対応 | OS の音声入力がそのまま使える（IME と同じ扱い） |
| Send (⌘↵ / Ctrl+Enter) | 入力内容をターミナルの stdin に送信 |
| Clear | 入力エリアをクリア |
| Template | よく使うプロンプトのプリセット（スラッシュコマンド等） |
| Resize (⇅) | Terminal Area との境界をドラッグで調整 |
| Auto-expand | 入力量に応じて高さが自動拡張（最大50%まで） |

**入力モードの使い分け:**
```
[簡単な指示] → ターミナルに直接タイプ
  例: "yes", "/compact", 短い返答

[長文プロンプト] → Composer で書いて Send
  例: 機能仕様の説明、複数ステップの指示、音声入力からの修正

[テンプレート活用] → Template ドロップダウンから選択
  例: コードレビュー依頼、PR作成指示、デバッグ手順
```

**技術的な実装:**
- Composer は通常の HTML `<textarea>` (or lightweight editor like CodeMirror)
- Send 時に内容をターミナルプロセスの stdin に write
- ターミナル側が入力待ち状態でなくてもキューに入れ、プロンプト表示後に送信
- フォーカス切替: Tab キーで Terminal ↔ Composer を行き来

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Remote connection | SSH | シンプル、鍵認証、既存インフラ活用可 |
| Session persistence | tmux | 実績あり、デタッチ/アタッチが自然 |
| Terminal rendering | xterm.js | Electron 内でターミナル表示の業界標準 |
| Mobile access | Existing tools | SSH クライアント（Termius 等）+ Claude remote control |
| Framework | Electron (keep) | 既存資産活用、xterm.js との相性良好 |

## MVP Scope

### Phase 1: Foundation

1. ✅ **Workspace model** — ワークスペースの CRUD、設定隔離、UI スイッチャー、SSH設定ダイアログ
2. ✅ **SSH connection** — リモートホストへの SSH 接続、鍵認証、接続テスト
3. ✅ **tmux integration** — セッション作成・アタッチ・デタッチ、自動命名 (ccs-\<ws\>-\<agent\>)
4. ✅ **xterm.js terminal** — メインエリアにリアルターミナル表示（node-pty + ssh2）
5. ✅ **LINE-style sidebar** — エージェント一覧、ステータス、最新出力、ワークスペースフィルタ
6. ✅ **Composer** — リッチテキスト入力エリア（テンプレート付き、自動展開）
7. ✅ **PTY mode sync** — main/renderer 間のモード設定同期、全IPC対応（SSH自動ルーティング含む）
8. ✅ **Session lifecycle** — セッション終了検出、再起動バナー、二重起動防止
9. ✅ **Agent Profile View** — CLAUDE.md, Memory, Skills, MCP, Hooks の可視化

### Phase 2: Agent Context Visualization ✅

Claude Code のパワーユーザーは CLI 周辺に独自の運用体系を構築している。
CLAUDE.md、Memory、Skills、Hooks、MCP など「エージェントの人格・記憶・能力」を
定義するファイル群が散在しており、全貌が見えない。Phase 2 ではこれを可視化する。

```
[Claude Code エコシステムの構造]
~/.claude/                          ← グローバル設定
├── CLAUDE.md                       ← 全セッション共通ルール
├── settings.json                   ← パーミッション、MCP
├── commands/                       ← カスタムスラッシュコマンド
├── skills/                         ← 再利用可能なスキル
├── templates/                      ← テンプレート
├── projects/<path>/memory/
│   └── MEMORY.md                   ← セッション横断メモリ
└── keybindings.json

<project>/                          ← プロジェクト固有
├── CLAUDE.md                       ← プロジェクトルール
├── .claude/
│   └── product-marketing-context.md
└── AGENTS.md                       ← チーム構成定義
```

#### 6. Agent Profile View — エージェントの全体像

エージェントを選択したときに「このエージェントが何者か」を一目で把握できるビュー。

```
┌─ Agent Profile: CPO ──────────────────────────────┐
│                                                    │
│ 📋 Rules (CLAUDE.md)                               │
│  ├── Global: ~/.claude/CLAUDE.md (200 lines)       │
│  └── Project: /my-project/CLAUDE.md (85 lines)     │
│  [View] [Edit] [Diff between levels]               │
│                                                    │
│ 🧠 Memory                                          │
│  └── MEMORY.md: 15 entries                         │
│  Last updated: 2h ago                              │
│  [View] [Search] [Edit]                            │
│                                                    │
│ ⚡ Skills & Commands                                │
│  ├── Skills: 10 loaded (design-critique, ...)      │
│  └── Commands: 16 available (/review-and-fix, ...) │
│  [Browse] [Assign to agent]                        │
│                                                    │
│ 🔌 MCP Servers                                     │
│  ├── 🟢 GitHub (connected, 12 tools)               │
│  ├── 🟢 Supabase (connected, 8 tools)              │
│  └── ⚪ Slack (not connected)                       │
│  [Manage]                                          │
│                                                    │
│ 🛡 Guardrails                                      │
│  ├── Hooks: 4 active (pre-commit lint, ...)        │
│  ├── Permissions: bypassPermissions ON             │
│  └── Settings: auto-approve tools                  │
│  [View hook log] [Edit]                            │
│                                                    │
│ 📜 Session History                                  │
│  ├── cpo-task-123 (3h ago, 45 messages)            │
│  ├── cpo-task-122 (yesterday, 120 messages)        │
│  └── ... 12 more sessions                          │
│  [Resume] [Fork] [Browse]                          │
│                                                    │
└────────────────────────────────────────────────────┘
```

| Section | Data Source | 機能 |
|---------|------------|------|
| **Rules** | `~/.claude/CLAUDE.md` + `<project>/CLAUDE.md` | 階層表示、継承関係のツリー、差分ビュー、インライン編集 |
| **Memory** | `~/.claude/projects/<path>/memory/MEMORY.md` + topic files | 全エントリ検索、トピック別閲覧、編集・削除 |
| **Skills & Commands** | `~/.claude/skills/`, `~/.claude/commands/`, project skills | 一覧表示、エージェントへの紐付け、使用頻度 |
| **MCP Servers** | `~/.claude/settings.json` の `mcpServers` | 接続状態、利用可能ツール一覧、ワークスペース単位の有効/無効 |
| **Guardrails** | `settings.json`, hooks config, CLAUDE.md 内のガードレール | フック一覧、発火ログ、パーミッション状態のバッジ表示 |
| **Session History** | `~/.claude/projects/<path>/` のセッションデータ | タイムライン表示、Resume/Fork ボタン、メッセージ数・期間 |

#### 8. Dashboard — 全ワークスペース横断の俯瞰

全ワークスペース・全エージェントのステータスを一画面で表示。

#### 9. Broadcast — 複数エージェントへの一括指示

### Phase 3: Advanced ✅

10. ✅ **Task chains** — エージェント間の自動連携（ChainOrchestrator + UI）
11. ✅ **Agent templates** — 役割・スキルのプリセット（Export/Import JSON）
12. ✅ **Notification system** — 完了・エラー・承認待ちの通知（Desktop + In-app Toast）
13. ✅ **Dashboard** — 組織図・スキルマップ・カンバン・日報
14. ✅ **Broadcast** — 複数エージェントへの一括指示
15. ✅ **Activity Log** — リアルタイムイベントフィード
16. ✅ **Quick Search (Command Palette)** — Ctrl+Kでアクション＋エージェント検索
17. ✅ **Keyboard Shortcuts** — 20+ショートカット、ヘルプオーバーレイ
18. ✅ **Error Boundary** — 堅牢なエラーリカバリ
19. ✅ **Window State Persistence** — サイズ・位置の復元
20. ✅ **i18n** — English / Japanese 完全対応

## Design Decisions (Resolved)

### 1. tmux Management — Auto-managed

アプリがリモート側の tmux セッションを自動作成・管理する。ユーザーは tmux を意識しない。

```
[アプリがやること]
1. SSH接続確立
2. tmux セッションの存在確認（tmux has-session -t <name>）
3. なければ作成（tmux new-session -d -s <name>）
4. あればアタッチ（tmux attach-session -t <name>）
5. 切断時は自動デタッチ（セッションは生き続ける）

[tmux セッション命名規則]
ccs-<workspace>-<agent>
例: ccs-companyA-cpo, ccs-personal-dev
```

### 2. Config Storage — Selectable (Local / Remote)

ワークスペース設定の保存先をユーザーが選択可能にする。

```
[ローカル保存] (デフォルト)
~/.claude-code-studio/
├── config.json              # グローバル設定（暗号化対象）
└── workspaces/
    ├── company-a/
    │   ├── workspace.json   # 接続先、エージェント定義
    │   └── secrets.enc      # APIキー等（暗号化）
    └── personal/
        ├── workspace.json
        └── secrets.enc

[リモート保存]
~/.claude-code-studio/ on remote host
└── (同じ構造)

[ハイブリッド]
- 接続情報・UIプリファレンス → 常にローカル
- APIキー・MCP設定 → ユーザー選択でローカル or リモート
- 理由: リモートマシンで実行するならキーもリモートにある方が安全なケースがある
```

**暗号化**: secrets.enc は OS のキーチェーン / Windows Credential Manager でマスターキーを管理。

### 3. Session ID Mapping — Claude Code Native Features を活用

Claude Code には既に強力なセッション管理がある。tmux はプロセス永続化に徹し、セッション管理は Claude Code に任せる。

```
[対応関係]
tmux session: ccs-companyA-cpo
  └── claude --resume "cpo-task-123" (Claude Code の --resume で復帰)

[アプリ内のマッピングテーブル]
workspace.json:
{
  "agents": [{
    "id": "cpo",
    "tmuxSession": "ccs-companyA-cpo",
    "claudeSessionId": "550e8400-...",    // Claude Code の session-id
    "claudeSessionName": "cpo-task-123",  // --resume で使う名前
    "projectPath": "/home/user/my-project"
  }]
}

[セッションライフサイクル]
1. 新規: claude --session-id <uuid>  → tmux 内で起動、UUID を記録
2. 再開: claude --resume <name|id>   → tmux にアタッチして --resume
3. 分岐: claude --resume <id> --fork-session → 並行作業用
4. 終了: セッション完了 → tmux セッション破棄 or 保持（設定次第）
```

**Key insight**: `-p` (print mode) は使わず、通常のインタラクティブモードで起動する。xterm.js で生ターミナルを表示するため、stream-json 解析は不要。ユーザーはそのまま Claude Code の CLI 体験を得る。

### 4. Remote Prerequisites — Bootstrap Package

リモート側の前提条件をセットアップスクリプトとしてパッケージに含める。

```bash
# ccs-bootstrap.sh — アプリから SSH 経由で実行
#!/bin/bash
set -e

echo "=== Claude Code Studio — Remote Setup ==="

# 1. Check OS
if [[ "$(uname)" != "Linux" && "$(uname)" != "Darwin" ]]; then
  echo "ERROR: Unsupported OS"; exit 1
fi

# 2. tmux
if ! command -v tmux &>/dev/null; then
  echo "Installing tmux..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y tmux
  elif command -v brew &>/dev/null; then
    brew install tmux
  else
    echo "ERROR: Cannot install tmux automatically"; exit 1
  fi
fi
echo "✓ tmux $(tmux -V)"

# 3. Claude Code CLI
if ! command -v claude &>/dev/null; then
  echo "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
fi
echo "✓ claude $(claude --version 2>/dev/null || echo 'installed')"

# 4. Create config directory
mkdir -p ~/.claude-code-studio
echo "✓ Config directory ready"

echo "=== Setup complete ==="
```

**アプリ側のフロー:**
1. 新規ワークスペース作成時に SSH 接続テスト
2. 前提条件チェック（tmux, claude CLI の存在確認）
3. 不足があれば「セットアップを実行しますか？」と確認
4. ユーザー承認後に bootstrap スクリプトを SSH 経由で実行
5. 結果を表示して完了

## Revised Architecture

### Key Architectural Change: xterm.js Direct Mode

当初は `stream-json` を解析してチャット UI に表示する設計だったが、
**xterm.js で生ターミナルを直接表示する方式に変更**する。

```
[旧設計 — stream-json 解析型]
claude -p --stream-json → アプリが JSON 解析 → チャット UI に変換
  問題: CLI の体験が劣化する、情報が間引かれる

[新設計 — xterm.js Direct 型]
┌─ Local mode ──────────────────────────┐
│ node-pty → xterm.js                   │
│ (ローカルで claude を起動、PTYで接続)    │
└───────────────────────────────────────┘

┌─ Remote mode ─────────────────────────┐
│ ssh2 → tmux attach → xterm.js        │
│ (SSH経由でtmuxセッションにアタッチ、     │
│  PTYストリームをxterm.jsに流す)          │
└───────────────────────────────────────┘

[共通] サイドバーのステータス更新は、ターミナル出力のパターンマッチで取得
  - "Thinking..." → status: thinking
  - "✓" / "Done" → status: idle
  - "Error" → status: error
  - 最新行の先頭 N 文字 → サイドバーのプレビューテキスト
```

### Dependency Changes

| Package | Purpose | Note |
|---------|---------|------|
| `xterm` + `@xterm/addon-fit` | ターミナル描画 | renderer process |
| `node-pty` | ローカル PTY | main process, native module |
| `ssh2` | SSH 接続 | main process |
| ~~`marked`~~ | ~~Markdown rendering~~ | 不要（チャットUI廃止） |

## Design Decisions (Resolved — Round 2)

### 5. Sidebar Status Detection — Pattern Match (MVP) + Future Enhancement

Claude Code の CLI 出力には特徴的なパターンがあり、MVP ではパターンマッチで十分な精度が得られる。

```
[検出パターン]
| 状態           | パターン                              | 信頼度 |
|----------------|---------------------------------------|--------|
| 完了・入力待ち  | プロンプト `>` 表示 / カーソル入力行    | 高     |
| 思考中         | "Thinking..." スピナー                 | 高     |
| ツール実行中   | "Read", "Edit", "Bash" 等のツール名    | 高     |
| 承認待ち       | "Allow" / "Deny" 選択肢表示           | 高     |
| エラー         | "Error", "error" を含む行              | 中     |

[実装]
xterm.js の onData / onLineFeed コールバックでターミナル出力を監視。
正規表現ベースのステートマシンでステータスを判定。

[将来の拡張案]
ハイブリッド: メインは xterm.js Direct、ステータス監視用に stream-json を
サイドカーで併用する。ただし MVP では複雑さに見合わないため見送り。
```

**バイパス設定の状態確認**: Claude Code の設定（`bypassPermissions` 等）は
セッション起動時のフラグや `~/.claude/settings.json` から読み取り、
サイドバーにバッジとして表示する（例: "Auto-approve ON" 等）。

### 6. Cross-Workspace Agent Movement — Not Supported (Template Only)

ワークスペース間のエージェント移動は**禁止**する。ワークスペースの存在意義は
「コンテキストの完全分離」であり、移動はその原則を破壊する。

```
[禁止する理由]
1. セキュリティ: 個人のAPIキーで会社リポジトリにアクセスする事故
2. 整合性: Claude Code のセッション履歴はプロジェクトパスに紐づく
   （~/.claude/projects/<path>/）。移動すると履歴が壊れる
3. 設計思想: ワークスペース = 隔離境界。越境は意図的に困難にすべき

[代わりに提供するもの — Agent Templates]
エージェントの「設定テンプレート」をエクスポート/インポートできる。

エクスポートされるもの:
  - 役割名（Role）
  - システムプロンプト
  - スキル構成
  - CLAUDE.md テンプレート

エクスポートされないもの:
  - セッション履歴
  - 認証情報（APIキー、MCP設定）
  - プロジェクトパス

[UX]
「このエージェントと同じ役割を別ワークスペースで作成」ボタン
→ テンプレートから新規エージェントを生成
→ 認証・プロジェクトは新ワークスペースの設定を使用
```

### 7. Multi-Device Concurrent Access — tmux Native Sync

複数デバイスからの同時接続は **tmux のネイティブ機能で自動的に実現**される。

```
[仕組み]
tmux は複数クライアントの同時アタッチをサポート:

  PC-A: ssh remote → tmux attach -t ccs-companyA-cpo
  PC-B: ssh remote → tmux attach -t ccs-companyA-cpo
    → 両方に同じ画面がリアルタイム表示
    → どちらからでも入力可能
    → コンフリクトは発生しない（同一 PTY への入出力）

Google Docs / Slack と同じリアルタイム同期の挙動。

[ウィンドウサイズ問題と対策]
tmux はデフォルトで接続中クライアントの最小サイズに合わせる。
PC（大画面）+ スマホ（小画面）の同時接続で PC 側が縮む。

対策: アプリ側で tmux の window-size オプションを設定
  tmux set-option -g window-size largest
  → 最大サイズに合わせる（小さい側はスクロールで対応）

[アプリ側の対応]
- セッション接続時に他のクライアント数を表示
  「このセッションに 2 デバイスが接続中」
- 排他接続オプション: tmux attach -d（他を強制デタッチ）
  → 設定画面で選択可能にする
```

## Open Questions (Remaining)

All major design questions have been resolved.
Remaining items are implementation-level details to be addressed during development:

- [ ] xterm.js のパターンマッチ用正規表現の精度チューニング
- [ ] Agent Template のエクスポートフォーマット（JSON? YAML?）
- [ ] tmux の window-size 設定をワークスペース単位で変更可能にするか
