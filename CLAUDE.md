This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lattice Tabs — a Chrome extension (Manifest V3) that organizes browser tabs using AI. Supports local Gemini Nano and cloud Gemini API. Version-controlled with Jujutsu (`jj`).

## Commands

```bash
npm run build          # TypeScript type-check + Vite production build (always run so user can test)
npm run dev            # Vite dev server
npm run test           # Vitest single run
npm run test:watch     # Vitest watch mode
npm run lint           # ESLint
npm run format         # Prettier (semi, singleQuote, printWidth: 200, tabWidth: 4)
npm run format:check   # Check formatting only
jj commit -m "message" # Commit (this repo uses Jujutsu, not git)
```

## Architecture

**Entry points** (separate Vite bundles):
- `src/background/index.ts` — Service Worker: state management, queue processing, Chrome event listeners, port messaging to UI
- `src/sidepanel/index.tsx` — Main UI: Dashboard with suggestions and configuration
- `src/options/index.tsx` — Settings page
- `src/welcome/index.tsx` — Onboarding page

**Data flow:**
Chrome events → `TabManager.triggerRecalculation` (debounced) → `queueAndProcess()` → `QueueProcessor` → `AIService` (Local or Gemini provider) → `StateService` caches suggestions → broadcasts to UI via port → `useTabGrouper` hook renders in Dashboard → user accepts or autopilot auto-applies → `applyTabGroup()` → action stored in undo history

**Key abstractions:**
- `StateService` (`background/state.ts`) — session storage cache for suggestions, snapshots, processing status, action history. Hydrates from `chrome.storage.session`.
- `ProcessingState` (`background/processing.ts`) — FIFO queue tracking active windows; detects "fatal changes" to abort stale processing
- `WindowSnapshot` (`utils/snapshots.ts`) — immutable fingerprint of a window's tabs/groups; used for staleness checking between AI batches
- `AIService` (`services/ai/AIService.ts`) — factory returning `LocalProvider` (Gemini Nano via `LanguageModel` API) or `GeminiProvider` (cloud)
- `SettingsStorage` (`utils/storage.ts`) — wraps `chrome.storage.sync`/`local`/`session`

**Storage layers:** sync (user settings, custom rules, API key), local (AI provider/model), session (suggestion cache, snapshots, processing state — cleared on reload)

**Modes:** Autopilot (auto-applies suggestions) vs Copilot (waits for user approval). Undo tracks last 10 actions per window.

## Coding Conventions

- Prefer declarative patterns (e.g., `useEffect` for state sync) over imperative event handlers
- Use encapsulated state classes (like `WindowState`) instead of global primitive flags
- Isolate processing and staleness tracking to the window level — changes in one window must never abort another
- For long-running operations, capture an input fingerprint at start and verify consistency between batches
- ALWAYS use `LanguageModel` API for local AI. NEVER use `window.ai` (deprecated).

## Design System

- ALWAYS use semantic tokens for colors/spacing (`bg-surface`, `text-muted`, `bg-btn-primary-bg`). Tokens defined in `src/sidepanel/index.css`.
- NEVER use hardcoded Tailwind colors (`bg-blue-500`, `text-slate-900`). Define a new semantic token if missing.
- Do not use `dark:` modifiers — the semantic token system handles dark mode.
- Use React components to encapsulate styles, not `@apply` CSS classes.

## Browser Testing

Chrome extensions cannot be automated on `chrome://` pages. After `npm run build`, manually load the `dist` folder via `chrome://extensions` (Developer Mode → Load unpacked).
