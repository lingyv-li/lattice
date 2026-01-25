## 2026-01-25 - [List Component Optimization]
**Learning:** Frequent parent re-renders (triggered by global state like `isBackgroundProcessing`) cause severe performance degradation in list components unless items are strictly memoized. `React.memo` alone is insufficient if props (especially callbacks and mapped arrays) are not referentially stable.
**Action:** When optimizing lists, always ensure:
1.  Callbacks are stable (use `useCallback` or pass IDs to a stable handler).
2.  Derived data (like mapped tabs) is computed in `useMemo` at the parent level, not inline in JSX.
3.  Components are wrapped in `React.memo`.
