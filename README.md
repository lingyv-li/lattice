# Lattice - Chrome Cleaner & Tab Organizer

A powerful Chrome Extension helping you keep your browser clean and organized using on-device AI.

## Features

### 🤖 AI Tab Grouper
Automatically organizes your cluttered tabs into logical groups using Chrome's built-in Nano Gemini model.
- **Privacy First**: All processing happens locally on your device.
- **Smart Grouping**: Intelligently categorizes tabs based on their content.
- **One-Click Organization**: Review suggested groups and apply them instantly.

### 🧹 Download Cleaner
Keep your downloads folder tidy by identifying and removing:
- **Duplicate Files**: Removes `(1)`, `(2)` copies of files.
- **Interrupted Downloads**: Cleans up failed or incomplete downloads.
- **Missing Files**: Removes entries for files that no longer exist on disk.

### ⚡ Performance
- Built with **React 19** and **Vite** for blazing fast performance.
- Uses **Tailwind CSS** for a modern, lightweight UI.
- **Service Worker** architecture for efficient background processing.

## Installation

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to build the extension.
4. Open Chrome and navigate to `chrome://extensions/`.
5. Enable "Developer mode".
6. Click "Load unpacked" and select the `dist` directory.

## Development

- `npm run dev`: Start the development server.
- `npm run build`: Build for production.
- `npm run lint`: Run linting checks.
- `npm run pack`: Create a release zip file.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Lucide React
- **Build Tool**: Vite
- **AI**: Chrome Built-in AI (Gemini Nano)
