## 2026-01-05 - Debouncing Tab Listeners in React Hooks
**Learning:** Chrome's `chrome.tabs.onUpdated` fires multiple times per page load (loading, title update, complete). Binding expensive state updates (like full window snapshots) directly to these listeners causes massive re-render storms and performance degradation.
**Action:** Always wrap event handlers for high-frequency Chrome API events (tabs, storage) in a `debounce` function, especially when they trigger React state updates or expensive computations.
