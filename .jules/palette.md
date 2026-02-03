## 2024-05-22 - Semantic Buttons for Interactive Cards
**Learning:** Refactoring `div role='button'` cards to semantic `<button>` elements simplified code by removing manual key handlers and improved accessibility by providing native focus/disabled states. Tailwind requires explicit `w-full text-left` to maintain card layout.
**Action:** Default to `<button>` for any interactive container, ensuring CSS resets are applied.
