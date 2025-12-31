### Architectural Optimization Patterns

1.  **Level-Up Processing (Entity to Container)**:
    - Avoid tracking individual low-level entities in the state/queue if they can be evaluated as a group within their parent container.
    - **Dirty Container Pattern**: Mark a parent container as "dirty" and perform fresh, atomic evaluation of all children during processing. This simplifies state and ensures data consistency.

2.  **State-Informed Prioritization**:
    - Use system activity or user interaction signals to re-order the processing queue.
    - **Freshness First**: Move the most recently flagged context to the head of the queue to ensure immediate feedback for active areas.

3.  **Thin Trigger / Heavy Processor separation**:
    - **Thin Trigger**: Keep triggers (event listeners, timers) lightweight. Their only job is to flag context for re-evaluation.
    - **Heavy Processor**: Centralize filtering, validation, and execution logic. Perform "just-in-time" checks (e.g., status, validity) to handle state changes that occurred during the delay.

### Example Findings
-   **Granularity Mismatch**: "System tracks 1000 individual items when they always belong to 5 containers." -> Fix: Implement container-level dirty flagging.
-   **Static Queueing**: "Processing order is fixed, ignoring current user focus." -> Fix: Implement a priority/REORDER logic in the state manager.
-   **Redundant Guards**: "Both trigger and processor perform the same validation logic." -> Fix: Consolidate 'should-process' logic in the execution loop.