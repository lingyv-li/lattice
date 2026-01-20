## 2026-01-20 - Confirmation Modal Accessibility
**Learning:** React 19's `useId` hook is excellent for linking `aria-labelledby` and `aria-describedby` in reusable components like modals, ensuring unique IDs without manual prop passing.
**Action:** Use `useId` for all future components requiring semantic ID linkage (inputs/labels, descriptions).

## 2026-01-20 - Modal Interaction Patterns
**Learning:** For "click-outside-to-close" behavior on modals, putting the click listener on the backdrop and `e.stopPropagation()` on the content container is a clean pattern that avoids complex ref checks.
**Action:** Use the backdrop-click + stopPropagation pattern for all simple overlays/modals.
