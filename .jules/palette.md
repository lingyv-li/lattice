## 2024-05-22 - Refactoring interactive divs to native buttons
**Learning:** Using `div role="button"` requires manual handling of keyboard events (Enter/Space) and focus management. Native `<button>` elements handle this automatically and are more robust.
**Action:** Always prefer `<button>` for interactive elements. If styling is an issue, reset styles but keep the semantic element.
