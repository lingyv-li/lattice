## 2024-05-22 - Modal Accessibility Pattern
**Learning:** React's `useId` hook coupled with `role="alertdialog"` and focus management is critical for creating accessible confirmation modals that don't trap screen reader users. Simple `div` overlays are invisible to assistive technology.
**Action:** Always wrap custom modal implementations with proper ARIA roles (`dialog`/`alertdialog`), manage focus (initial focus + trap if possible), and ensure `Escape` key closes the modal. Use `useId` for robust `aria-labelledby`/`aria-describedby` linking.
