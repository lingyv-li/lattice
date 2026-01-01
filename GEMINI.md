# Project Context

This directory is versions controlled using `jj` (Jujutsu).
- **Commit**: `jj commit -m "message"`
- **Push**: `jj git push`


## Development Workflow
- **Dev Server**: `npm run dev` (Runs Vite)
- **Build**: `npm run build` (Type-check & Build for production - always run this so user can test the changes)
- **Test**: `npm run test` (Run unit/component tests)
- **Lint**: `npm run lint`

## Project Architecture
- **Manifest V3**: Uses a Service Worker (`src/background/index.ts`) for API proxying to handle CORS and persistent background tasks.

## Coding Preferences
- **Declarative Code**: Prefer declarative patterns (e.g., `useEffect` for state sync) over imperative event handlers.
- **Maintainability**: Prioritize clean, modular, and easy-to-maintain code.
- **Readability**: Ensure code is self-documenting and easy to read.
- **Encapsulated State**: Use specialized classes (like `WindowState`) to manage metadata for specific entities (windows, tabs) instead of global primitive flags.
- **Improvements**: Look for areas with room for improvement, but do not implement them immediately. Suggest them to the user at the end of the task.
- **AI API**: ALWAYS use the `LanguageModel` API for local AI. NEVER use `window.ai` as it is deprecated.

## Architectural Patterns
- **Atomic Window Processing**: Always isolate processing logic and staleness tracking to the window level. A change in one window should never abort processing in another.
- **Input Snapshotting**: For long-running or batch operations (like AI grouping), capture a fingerprint of the input state at the start. Verify consistency against this snapshot between batches to prevent data races (e.g., closing a tab during an AI call).

## Browser Testing

Due to browser security restrictions, automation tools cannot interact with `chrome://` pages (like `chrome://extensions`).

### Manual Installation Required
1.  **Build**: Run `npm run build` first.
2.  **Open Extensions Page**: Go to `chrome://extensions`.
3.  **Enable Developer Mode**: Toggle the switch in the top right.
4.  **Load Unpacked**: Click "Load unpacked" and select the `dist` folder.
    *   *Note*: Drag-and-drop also works.

### Automation Capabilities
-   **Can**: Navigate to extension pages directly if the extension is installed (e.g., `chrome-extension://<id>/src/sidepanel/index.html`).
-   **Cannot**: Click buttons on `chrome://` system pages.

## Agent Behavior Guidelines
**Preventing "Laziness" & Ensuring Thoroughness**
To avoid being perceived as "lazy" or "low-effort," future agents MUST adhere to these strict behavioral rules:

1.  **Verify Assumptions**: ALWAYs verify the output of a tool call. If an edit is "applied," check the file to confirm it actually applied correctly (especially if previous steps failed). Do not assume success.
2.  **Fix Regressions Immediately**: If a change causes a regression (like a lint error or test failure), do not ignore it or move on to a different file hoping it goes away. Stop and fix it immediately.
3.  **No Blind Edits**: Do not propose or apply code edits without first reading the surrounding context of the file. Blind edits lead to duplicate arguments, syntax errors, and destroyed logic.
4.  **Complete the Job**: When refactoring, ensure *all* call sites are updated. Do not leave "dead" variables, unused imports, or mismatched arguments.
5.  **Clean Up**: Remove any temporary code, unused parameters, or commented-out blocks before asking for review.
