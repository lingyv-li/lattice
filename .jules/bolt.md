## 2023-12-18 - Unchecked Chrome Event Frequency
**Learning:** `chrome.tabs.onUpdated` fires excessively (loading, title, favicon, complete) for every tab. Direct bindings to expensive operations (like `WindowSnapshot.fetch`) cause massive IPC and CPU spikes during window restoration or bulk tab opening.
**Action:** Always wrap `onUpdated` listeners with a debounce function (min 500ms) when triggering state recalculations. Ensure the debounce utility supports cancellation to prevent state updates on unmounted components.
