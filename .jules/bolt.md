## 2024-05-22 - [React Render Optimization in Lists]
**Learning:** `SuggestionList` was re-creating `onClick` handlers and `tabs` arrays (via `.map`) inside the render loop, breaking `React.memo` optimization on `SuggestionItem`. This caused all items to re-render whenever the parent updated, even if the item data hadn't changed.
**Action:** When passing derived data (like mapped arrays) or callbacks to memoized list items, always transform the data inside `useMemo` and use `useCallback` for handlers, or pass stable identifiers and let the parent handle the action via a stable delegate.
