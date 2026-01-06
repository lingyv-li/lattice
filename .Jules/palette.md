## 2026-01-06 - Accessible Custom Checkboxes in Lists
**Learning:** When using `div` elements for selectable list items (like the group preview suggestions), they are completely invisible to screen readers and keyboard users by default. Adding `role="checkbox"`, `tabIndex="0"`, and `onKeyDown` handlers for Enter/Space is essential.
**Action:** For any future interactive list items that act as toggles, immediately implement the ARIA checkbox pattern and ensure `focus-visible` styles are present for keyboard users.
