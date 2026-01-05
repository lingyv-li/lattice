import { WindowSnapshot } from '../utils/snapshots';
import { StateService } from './state';

/**
 * Encapsulates the processing status of a single window.
 */
export class WindowState {
    constructor(
        public readonly id: number,
        public inputSnapshot: WindowSnapshot
    ) { }

    /**
     * Updates the snapshot from pre-fetched data (from fetchWindowSnapshotData).
     */
    update(snapshot: WindowSnapshot) {
        this.inputSnapshot = snapshot;
    }

    /**
     * Verifies if the current window state matches the stored snapshot.
     * Uses fetchWindowSnapshotData as the single source of truth.
     */
    async verifySnapshot(): Promise<boolean> {
        const snapshot = await WindowSnapshot.fetch(this.id);
        return this.inputSnapshot.equals(snapshot);
    }
}

export class ProcessingState {
    private windowQueue: number[] = []; // Ordered unique window IDs (front = priority)
    private activeWindows: Set<number> = new Set();
    private windowStates = new Map<number, WindowState>();
    private _lastEmittedState = false;

    // Callback for when an active window is re-queued with new data
    public onWindowRequeued: ((windowId: number) => void) | null = null;

    private updateStatus() {
        // Status is valid if we have queued items OR active items
        const isProcessing = this.windowQueue.length > 0 || this.activeWindows.size > 0;

        if (isProcessing !== this._lastEmittedState) {
            console.log(`[ProcessingState] Status changed: ${this._lastEmittedState} -> ${isProcessing} (Active: ${this.activeWindows.size}, Queued: ${this.windowQueue.length})`);
            this._lastEmittedState = isProcessing;
        }

        // Sync all relevant windows (Active + Queued) to storage
        // This ensures the UI spinner stays active for windows currently being processed
        const allIds = new Set([...this.activeWindows, ...this.windowQueue]);
        StateService.setProcessingWindows(Array.from(allIds)).catch(err => {
            console.error("[ProcessingState] Failed to sync status to storage", err);
        });
    }

    get isProcessing(): boolean {
        return this.windowQueue.length > 0 || this.activeWindows.size > 0;
    }

    get isBusy(): boolean {
        return this.activeWindows.size > 0;
    }

    /**
     * Gets the window state if it exists.
     */
    getWindowState(windowId: number): WindowState | undefined {
        return this.windowStates.get(windowId);
    }

    /**
     * Marks a window processing as complete and clean.
     * Persists the snapshot that was CAPTURED at enqueue time (or updated via re-queue).
     * This is the "Checkpoint": We only save to storage after we assume success.
     */
    async completeWindow(windowId: number) {
        console.log(`[ProcessingState] Window ${windowId} completed`);

        // Retrieve the state before deleting it to persist the snapshot
        const state = this.windowStates.get(windowId);
        if (state) {
            await this.updateKnownState(windowId, state.inputSnapshot);
        }

        this.activeWindows.delete(windowId);

        // If the window is still in the queue (re-queued), keep the state
        if (this.windowQueue.includes(windowId)) {
            console.log(`[ProcessingState] Window ${windowId} is queued again, keeping state.`);
        } else {
            this.windowStates.delete(windowId);
        }

        this.updateStatus();
    }

    get size(): number {
        return this.windowQueue.length + this.activeWindows.size;
    }

    get hasItems(): boolean {
        return this.windowQueue.length > 0;
    }

    /**
     * Enqueue a window for processing using a provided snapshot.
     * If it already exists, move it to the front (Priority).
     * 
     * IMPROVEMENT: Does NOT persist to storage immediately.
     * Checks in-memory queue to prevent duplicate work for the same fingerprint.
     */
    async enqueue(windowId: number, snapshot: WindowSnapshot, highPriority: boolean = true): Promise<boolean> {
        const existingState = this.windowStates.get(windowId);

        if (existingState) {
            // DUPLICATE WORK CHECK:
            // If we are already tracking this window, and the snapshot fingerprint hasn't changed,
            // then we should IGNORE this request. We are already on it.
            if (existingState.inputSnapshot.equals(snapshot)) {
                console.log(`[ProcessingState] Skipping enqueue for Window ${windowId}: Already queued/active with same fingerprint.`);
                return false;
            }

            // Fingerprint changed! Update the efficient in-memory state
            existingState.update(snapshot);
        } else {
            // New entry
            const state = new WindowState(windowId, snapshot);
            this.windowStates.set(windowId, state);
        }

        const existingIndex = this.windowQueue.indexOf(windowId);

        // If window is currently active, notify listeners that it was re-queued (new data available)
        if (this.activeWindows.has(windowId)) {
            if (this.onWindowRequeued) {
                this.onWindowRequeued(windowId);
            }
        }

        if (existingIndex !== -1) {
            // If already queued, only move to front if high priority
            if (highPriority && existingIndex > 0) {
                this.windowQueue.splice(existingIndex, 1);
                this.windowQueue.unshift(windowId);
            }
            return false;
        }

        // New window: Queue based on priority
        if (highPriority) {
            this.windowQueue.unshift(windowId); // Front (High Priority)
        } else {
            this.windowQueue.push(windowId); // Back (Low Priority)
        }

        this.updateStatus();
        return true;
    }

    /**
     * Updates the known state of a window (persistence) without adding it to the processing queue.
     * Useful for marking a window as "seen" or "clean" when no processing is needed.
     */
    async updateKnownState(windowId: number, snapshot: WindowSnapshot): Promise<void> {
        await StateService.updateWindowSnapshot(windowId, snapshot);
    }

    /**
     * Check if a tab's window is being processed or queued.
     */
    has(windowId: number): boolean {
        return this.windowStates.has(windowId);
    }

    // Lock and get all window IDs in priority order
    acquireQueue(): number[] {
        if (this.windowQueue.length === 0) return [];

        // Move from queue to active
        const workQueue = [...this.windowQueue];
        for (const id of workQueue) {
            this.activeWindows.add(id);
        }
        this.windowQueue = [];

        console.log(`[ProcessingState] Acquired queue: ${workQueue.length} windows`);
        this.updateStatus();
        return workQueue;
    }

    remove(windowId: number): boolean {
        let changed = false;
        const index = this.windowQueue.indexOf(windowId);
        if (index !== -1) {
            this.windowQueue.splice(index, 1);
            changed = true;
        }
        if (this.activeWindows.has(windowId)) {
            this.activeWindows.delete(windowId);
            changed = true;
        }

        // Also remove the state object so has() returns false
        if (this.windowStates.has(windowId)) {
            this.windowStates.delete(windowId);
            // If it was in windowStates but not queue/active, changed might not be true yet?
            // Usually it is at least in one of them if in windowStates.
        }

        if (changed) {
            this.updateStatus();
            return true;
        }
        return false;
    }

    clear() {
        this.windowQueue = [];
        this.activeWindows.clear();
        this.windowStates.clear();
        this._lastEmittedState = false;
        this.updateStatus();
    }
}
