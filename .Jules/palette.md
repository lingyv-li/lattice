## 2026-01-05 - Missing Keyboard Accessibility in Custom List Components

**Learning:** Custom interactive list items (like selection cards or preview items) implemented as `div`s with `onClick` often miss crucial accessibility attributes, making them unusable for keyboard users.
**Action:** When creating custom interactive list items:
1.  Add `role="button"` or `role="checkbox"`.
2.  Add `tabIndex={0}` to make it focusable.
3.  Add `onKeyDown` handler for Enter/Space keys.
4.  Add appropriate ARIA states (`aria-pressed`, `aria-checked`).
5.  Add visible focus styles (`focus-visible:ring-...`).
