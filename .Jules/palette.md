## 2026-01-14 - SelectionCard Accessibility Pattern
**Learning:** Interactive cards implemented as `div`s often lack keyboard accessibility. Using a nested semantic `<button>` for the primary toggle action (while keeping the container clickable for mouse) provides a robust accessible handle without invalid HTML nesting.
**Action:** When refactoring clickable cards, ensure the primary action is exposed via a focused button with `aria-pressed`, and always include explicit `focus-visible` styles as Tailwind preflight removes defaults.
