# Palette's Journal

## 2026-02-06 - Semantic Buttons vs Divs
**Learning:** Refactoring `div role="button"` to native `<button>` significantly improves accessibility and code simplicity, but requires explicit CSS resets (`w-full`, `text-left`) to match block-level div behavior.
**Action:** When converting interactive divs to buttons, immediately apply reset classes and verify layout.
