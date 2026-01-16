## 2026-01-16 - Custom Selection Cards
**Learning:** Custom 'card' selection components implemented with `div`s lack native accessibility (focus, keyboard support, screen reader roles).
**Action:** Always add `role="checkbox"`, `tabIndex="0"`, `aria-checked`, and `onKeyDown` handlers for Space/Enter to interactive card components.
