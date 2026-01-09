# Palette's Journal

## 2025-10-26 - Accessible Interactive Cards
**Learning:** Nested interactive elements (like buttons inside a clickable card) are invalid HTML if the card itself is a `<button>` or `<a>`.
**Action:** Use a layout `div` for the card container and delegate the primary action (toggle) to a specific, keyboard-accessible child element (like a checkbox button), while keeping the container clickable for mouse users via a separate handler.
