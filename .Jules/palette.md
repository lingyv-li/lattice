## 2024-05-22 - Replacing div-buttons with native buttons
**Learning:** When replacing a `div` with `role="button"` to a native `<button>`, adding `w-full text-left` is crucial for flex containers where the element should stretch and align text correctly, as native buttons center text and shrink-to-fit by default.
**Action:** Always verify layout with `w-full text-left` when refactoring to native buttons in card-like interfaces.
