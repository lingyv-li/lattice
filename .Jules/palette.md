## 2026-01-23 - SuggestionItem Accessibility
**Learning:** Interactive cards implemented as `div`s with `onClick` are a common pattern here. Converting them to `<button type="button">` with `w-full text-left` is a reliable fix that preserves layout while granting native accessibility.
**Action:** Look for other `div`s with `onClick` and `cursor-pointer` to apply this pattern.
