# Lattice Tabs - AI Tab Manager

A privacy-first Chrome extension that organizes your tabs using **Local AI** (Gemini Nano). No data leaves your device.

## Why Lattice Tabs?

Most AI tab managers send your browsing data to the cloud. Lattice Tabs uses Chrome's **built-in Gemini Nano** model, which runs entirely on your device. This means:

- **Zero network requests** for tab analysis (verify in DevTools Network tab)
- **No API keys required** for local mode
- **No subscription fees** - local AI has zero marginal cost

### Optional Cloud Mode

For users who want more powerful reasoning (e.g., non-English content or complex research topics), you can optionally enable **Gemini Cloud** with your own API key.

## Features

### 🤖 AI Tab Grouping
- **Autopilot Mode**: Runs in the background, groups tabs automatically as you browse
- **Copilot Mode**: Generates suggestions, waits for your approval before applying
- **Custom Rules**: Define your own grouping preferences (e.g., "Never group by domain")

### 🧹 Duplicate Tab Cleaner
Automatically detects and closes duplicate tabs to reduce clutter.

## Installation

1. Clone the repository
2. `npm install`
3. `npm run build`
4. Open `chrome://extensions/`, enable "Developer mode"
5. "Load unpacked" → select the `dist` directory

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run test     # Run tests
npm run pack     # Create release zip
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI**: Chrome Built-in AI (Gemini Nano) + Optional Gemini Cloud
- **Build**: Vite
- **Architecture**: Manifest V3, Service Worker

## Privacy

This extension:
- ✅ Processes tabs locally using Chrome's built-in AI
- ✅ Never sends browsing data to external servers (in local mode)
- ✅ Open source - audit the code yourself

## License

MIT
