## 2025-02-18 - [Dependency Discipline & Verification Hygiene]
**Learning:** Verification tools (like Playwright) must be installed temporarily without modifying `package.json` (`npm install --no-save` or strictly temporary). Test harnesses and mocks created for verification must be deleted before submission and never committed to the repository.
**Action:** When verifying frontend changes, install tools temporarily and delete all verification artifacts (harness files, scripts, images) before requesting final code review or submitting.
