## 2024-05-23 - [Debounce Chrome Events]
**Learning:** `chrome.tabs.onUpdated` fires multiple times per page load (loading, title change, complete). Listeners triggering expensive operations (like full window snapshots) MUST be debounced to prevent IPC floods and CPU spikes.
**Action:** Always wrap `onUpdated` listeners in a `debounce` function. Ensure the debounce utility supports `.cancel()` for proper cleanup in React `useEffect`.
