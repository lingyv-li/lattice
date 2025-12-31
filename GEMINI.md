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
- **Improvements**: Look for areas with room for improvement, but do not implement them immediately. Suggest them to the user at the end of the task.
