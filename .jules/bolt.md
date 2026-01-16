## 2024-05-22 - Debounce Utility Cleanup
**Learning:** The `debounce` utility in `src/utils/debounce.ts` lacked a `cancel` method, making it unsafe for use in React `useEffect` cleanup. This forced components to either leak timers or avoid using the shared utility.
**Action:** Always verify utility functions support proper lifecycle management (cleanup/cancellation) before using them in React hooks.
