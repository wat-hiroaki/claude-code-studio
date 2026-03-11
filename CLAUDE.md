# Claude Code Desktop

## Architecture
- **Electron** (main + preload + renderer) via `electron-vite`
- **Main process**: `src/main/` — IPC handlers, database, session manager
- **Renderer**: `src/renderer/src/` — React 18 + Tailwind CSS + Zustand
- **Shared types**: `src/shared/types.ts`

## Key Patterns
- SessionManager uses `claude -p --input-format stream-json --output-format stream-json`
- JSON file DB at `%APPDATA%/claude-code-desktop/database.json` (atomic writes)
- All IPC calls validated in main process before execution
- `validateProjectPath()` prevents path traversal in session-manager

## Build
```bash
npm run dev          # Dev with HMR
npm run build        # Production build
npm run lint         # ESLint
npm run package      # Windows installer
```

## i18n
- English: `src/renderer/src/i18n/locales/en.json`
- Japanese: `src/renderer/src/i18n/locales/ja.json`
- Add keys to BOTH files when adding UI text

## Component Conventions
- Named exports only
- Use `useTranslation()` for all user-facing text
- Use `cn()` from `lib/utils` for conditional classNames
- Icons from `lucide-react`
