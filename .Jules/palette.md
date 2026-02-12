## 2026-02-12 - Semantic Buttons over ARIA
**Learning:** Replacing interactive `div`s with native `<button>` elements significantly simplifies accessibility implementation (no manual `tabIndex`, `onKeyDown`, or `role` needed) and ensures consistent behavior across browsers/screen readers.
**Action:** When refactoring "card" or "list item" interactions, always prioritize wrapping the interactive area in a `<button type="button">` with `text-left` and `w-full` instead of patching `div`s with ARIA.
