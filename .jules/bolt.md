## 2026-01-28 - React List Rendering Optimization
**Learning:** In `SuggestionList`, transforming data (mapping `chrome.tabs.Tab` to UI model) inside the render loop created excessive garbage and prevented `React.memo` from working in children, even when the data source was memoized.
**Action:** Move data transformation logic into the `useMemo` block that generates the data source. Ensure all callbacks passed to memoized list items are stable using `useCallback`/`useRef`.
