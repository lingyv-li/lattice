## 2026-01-11 - WindowSnapshot Lookup Optimization
**Learning:** `Array.find` and `Array.some` on large arrays of tabs (common in browser extensions) can become a bottleneck when called frequently (e.g., inside loops or render cycles).
**Action:** Use `Map<id, Tab>` and `Set<id>` for O(1) lookups in data classes like `WindowSnapshot` that are read frequently.
