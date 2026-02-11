## 2024-05-23 - Complex Interactive Cards as Buttons
**Learning:** Interactive cards with nested visual elements (like icons, text, arrows) can often be implemented as single native `<button>` elements instead of `div`s with ARIA roles. This gives native keyboard support (Enter/Space) and focus management for free, reducing code complexity and bugs.
**Action:** When seeing `div role="button"` wrappers, check if they can be refactored to `<button type="button" className="w-full text-left ...">` to improve accessibility and simplify code.
