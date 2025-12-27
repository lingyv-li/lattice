# Project Context

This directory is versions controlled using `jj` (Jujutsu).
- **Commit**: `jj commit -m "message"`
- **Push**: `jj git push`


## Development Workflow
- **Dev Server**: `npm run dev` (Runs Vite)
- **Build**: `npm run build` (Type-check & Build for production - always run this so user can test the changes)
- **Test**: `npx vitest run` (Run unit/component tests)
- **Lint**: `npm run lint`

## Project Architecture
- **Manifest V3**: Uses a Service Worker (`src/background/index.ts`) for API proxying to handle CORS and persistent background tasks.

 