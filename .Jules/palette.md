## 2024-05-22 - Accessible Interactive Cards
**Learning:** For complex interactive cards (like `SelectionCard`) that contain nested interactive elements, `role="checkbox"` cannot be applied to the container.
**Action:** Use a specific `<button role="checkbox">` element for the toggle action inside the card, while keeping the container click handler for mouse users. Use `e.stopPropagation()` on the inner button to prevent double-toggling.
