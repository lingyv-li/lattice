## 2024-05-22 - Debouncing Chrome Event Listeners in React Hooks
**Learning:** Chrome API event listeners (like `chrome.tabs.onUpdated`) fire frequently. When debouncing them in a React `useEffect`, the debounce utility MUST support cancellation to prevent state updates on unmounted components.
**Action:** Always ensure custom debounce utilities expose a `cancel()` method and call it in the `useEffect` cleanup function.
