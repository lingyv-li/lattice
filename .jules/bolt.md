## 2025-05-23 - Rapid Tab Events and Window Snapshots
**Learning:** `chrome.tabs.onUpdated` fires multiple times during a single page load (loading, title change, complete). Directly calling expensive operations like `WindowSnapshot.fetch` (which queries all tabs) from these listeners causes significant overhead and IPC traffic.
**Action:** Always debounce listeners for `chrome.tabs.onUpdated` (and similar events) when they trigger full window scans or expensive recalculations. Use a cancellable debounce utility to clean up timers on component unmount.
