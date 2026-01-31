## 2024-05-22 - Accessible Modals & Brand Focus
**Learning:** Custom interactive elements in this design system require manual `focus-visible` styles using `focus-visible:ring-brand-local` to maintain brand consistency while ensuring accessibility. The default browser focus ring is often suppressed or invisible against the UI.
**Action:** When creating or refactoring interactive components, always explicitly define `focus-visible` states using the `--brand-local` token.
