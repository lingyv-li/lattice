## 2026-01-27 - Interactive Card Accessibility
**Learning:** The "SuggestionItem" cards were implemented as `div`s with inner click handlers, making them inaccessible to keyboard users and screen readers. Additionally, they contained heading tags (`h3`) which are invalid inside the corrected `<button>` structure.
**Action:** For all interactive list items, use `<button type="button">` as the container. Ensure `text-left` and `w-full` are applied. Replace internal headings with styled `div`s to maintain valid HTML semantics.
