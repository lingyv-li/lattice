## 2026-01-19 - Chrome API Event Storms
**Learning:** Chrome's `onUpdated` event fires multiple times per page load (loading, title change, complete). React components listening to this must debounce expensive operations (like `WindowSnapshot.fetch`) to prevent UI freezes and wasted cycles.
**Action:** Always wrap `onUpdated` listeners in a `debounce` handler (min 500ms) and ensure the debounced function has a `cancel()` method for proper cleanup in `useEffect`.
