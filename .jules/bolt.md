## 2026-01-12 - [WindowSnapshot Lookup Optimization]
**Learning:** Arrays are simple but O(N) lookups inside loops create O(N*M) or O(N^2) bottlenecks that are easily missed in small test suites but painful in production with many tabs.
**Action:** When working with collections of items that have unique IDs (like tabs), always prefer creating a `Map` or `Set` for O(1) access if you need to look them up frequently. The initialization cost (O(N)) is paid once, but the lookup savings are permanent.
