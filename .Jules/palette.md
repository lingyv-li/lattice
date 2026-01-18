## 2026-01-18 - Accessible Modal Patterns
**Learning:** Custom modals often miss critical accessibility features. A complete implementation requires:
1. `role="dialog"` or `alertdialog` and `aria-modal="true"`.
2. `useId` for stable `aria-labelledby` and `aria-describedby` links.
3. `Escape` key listener for closing.
4. Backdrop click handler (checking `target === currentTarget`).
5. Initial focus management (especially focusing "Cancel" for destructive actions).

**Action:** When building or refactoring modals, verify these 5 points. Use a shared hook or component if this pattern repeats.
