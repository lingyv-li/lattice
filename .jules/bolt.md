# Bolt's Journal

## 2024-05-22 - [WindowSnapshot Performance]
**Learning:** `WindowSnapshot` fetches all tabs in the window, which is an expensive operation. High-frequency triggers (like tab updates) can cause performance issues if not debounced.
**Action:** Always debounce listeners that trigger `WindowSnapshot` updates.

## 2024-05-22 - [AI Service Architecture]
**Learning:** The AI service uses a hybrid approach. `LocalProvider` uses `window.ai` which runs on the edge. Batching or Map-Reduce strategies are needed here to manage token limits effectively, as local models often have stricter limits than cloud ones.
**Action:** When working with `LocalProvider`, ensure inputs are chunked or summarized if they exceed typical local context windows.
