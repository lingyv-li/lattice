## 2026-01-06 - WindowSnapshot Optimization
**Learning:** Calculating fingerprints on-demand (O(N log N)) inside high-frequency checks like `isFatalChange` is a bottleneck.
**Action:** Move expensive calculations to the constructor and cache the results. Also, sort by numeric ID instead of stringifying first.
