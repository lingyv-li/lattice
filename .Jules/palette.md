## 2024-05-23 - Interactive Elements Semantics
**Learning:** Found interactive cards using `div` with `onClick` instead of semantic `<button>` elements. This prevents keyboard access and requires manual implementation of focus styles/interaction handling.
**Action:** Always use `<button type="button">` for interactive elements that trigger actions, even if they look like cards. Use `w-full text-left` to reset button styles if needed, and ensure `focus-visible` styles are applied for keyboard users.
