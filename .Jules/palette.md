## 2024-05-22 - Keyboard Accessibility for Custom Interactive Cards
**Learning:**
Complex interactive cards (like selection cards) built with `div`s often lack basic keyboard accessibility. Users navigating via keyboard cannot focus or interact with them unless `tabIndex`, `role`, and key handlers (Enter/Space) are explicitly added.

**Action:**
When creating custom interactive elements (especially cards that act as checkboxes or buttons):
1.  Add `role="checkbox"` (or appropriate role).
2.  Add `tabIndex="0"` (or `-1` if disabled).
3.  Add `onKeyDown` to handle 'Enter' and 'Space'.
4.  Add `aria-checked` and `aria-disabled`.
5.  Ensure `focus-visible` styles are prominent.
