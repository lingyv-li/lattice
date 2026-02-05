## 2026-02-05 - Semantic Buttons for Interactive Cards
**Learning:** Replacing `div` with `role="button"` with native `<button>` elements simplifies accessibility implementation (keyboard handling, focus) but requires careful CSS resets (text alignment, width) to maintain layout.
**Action:** Default to `<button type="button" className="w-full text-left">` for card-like interactive elements instead of divs.
