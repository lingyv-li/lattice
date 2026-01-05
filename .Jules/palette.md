## 2024-05-23 - Custom Modal Accessibility
**Learning:** Custom modals often miss basic accessibility features like focus management and ARIA roles.
**Action:** Always add `role="dialog"`, `aria-modal="true"`, focus trapping (or at least initial focus), and Escape key handling to custom modal components. Use `aria-labelledby` and `aria-describedby` to link the title and description.
