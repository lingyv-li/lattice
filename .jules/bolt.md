## 2026-01-14 - Discrepancy between Memory and Code
**Learning:** The project memory/documentation claimed `WindowSnapshot` used `Map`/`Set` for O(1) lookups, but the actual code used O(N) array methods (`find`, `some`). This highlights that memory can become stale or reflect "intended" state rather than actual state.
**Action:** Always verify "known" optimizations by reading the source code before assuming they exist. When optimizing, check if the "optimized" path is actually implemented or just documented.
