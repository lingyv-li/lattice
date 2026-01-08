## 2026-01-08 - WindowSnapshot Cost
**Learning:** `WindowSnapshot.fetch` triggers Chrome IPC calls and processes all tabs. In `useTabGrouper`, `onUpdated` events fire frequently (loading status, title changes), causing massive re-render storms.
**Action:** Always debounce event listeners that trigger `WindowSnapshot` or state updates derived from it.
