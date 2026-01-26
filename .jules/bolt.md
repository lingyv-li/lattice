## 2024-05-22 - Optimizing React List Rendering
**Learning:** `React.memo` on list items is ineffective if the parent component creates new object references (like arrays from `.map()` or inline arrow functions) in the render loop. To truly optimize lists, you must:
1.  Pre-calculate derived data (like mapped arrays) in a `useMemo` in the parent.
2.  Use stable callback handlers (via `useCallback`) and pass identifiers (like `id`) so the item component can invoke the handler without needing a new closure created in the parent's render.
**Action:** When optimizing lists, always check that props passed to memoized items are referentially stable.
