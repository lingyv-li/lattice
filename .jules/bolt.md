## 2026-01-13 - Frontend Tab Event Debouncing
**Learning:** `chrome.tabs.onUpdated` fires multiple times during a single page load (loading, title change, complete). Listening to this event without debouncing to trigger expensive operations (like `WindowSnapshot.fetch`) causes significant performance degradation in the frontend.
**Action:** Always debounce listeners for `onUpdated`, `onCreated`, and `onRemoved` when they trigger heavy state re-calculations.
