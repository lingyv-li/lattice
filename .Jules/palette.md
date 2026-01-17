## 2024-05-22 - Interactive Card Accessibility
**Learning:** Custom interactive cards (divs with click handlers) are invisible to screen readers and keyboard users unless explicitly configured.
**Action:** When creating selection cards, always add `role="checkbox"`, `tabIndex="0"`, `aria-checked`, and `onKeyDown` (Enter/Space) handlers. Ensure `focus-visible` styles are applied for keyboard navigation visibility.
