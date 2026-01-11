## 2026-01-11 - Modal Accessibility Patterns
**Learning:** Custom modals often miss critical accessibility features like `role="dialog"`, `aria-modal="true"`, focus trapping, and Escape key handling.
**Action:** Always check `ConfirmationModal` and similar overlay components for these attributes. Use `useEffect` for key listeners and focus management if a library isn't used. Ensure focus is restored to the triggering element on close.
