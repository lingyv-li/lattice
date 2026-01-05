import { WindowSnapshot } from '../utils/snapshots';
import { StateService } from './state';

/**
 * Encapsulates the processing status of a single window.
 */
class WindowState {
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
     * Checks if the window state has changed since it was last successfully processed.
     * Fetches current state internally using the centralized snapshot function.
     * Always compares against the persisted state in StateService.
     */
    async isWindowChanged(windowId: number): Promise<boolean> {
        const currentSnapshot = await WindowSnapshot.fetch(windowId);

        // Always compare against the last persisted snapshot to decide if we need to process
        const lastPersistent = await StateService.getWindowSnapshot(windowId);
        const changed = !currentSnapshot.equals(lastPersistent);

        if (changed) {
            console.log(`[ProcessingState] Window ${windowId} changed:`);
            console.log(`  Previous: ${lastPersistent ?? '(none)'}`);
            console.log(`  Current:  ${currentSnapshot}`);
        }
        return changed;
    }

    /**
     * Marks a window processing as complete and clean.
     * Persists the snapshot that was captured at enqueue time.
     */
    async completeWindow(windowId: number) {
        console.log(`[ProcessingState] Window ${windowId} completed`);

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
     * Add a window for processing. If it already exists, move it to the front (Priority).
     * Captures the snapshot at enqueue time to ensure consistency.
     * Uses centralized fetchWindowSnapshotData to ensure consistent schema.
     */
    async add(windowId: number, highPriority: boolean = true): Promise<boolean> {
        const snapshot = await WindowSnapshot.fetch(windowId);
        const existingIndex = this.windowQueue.indexOf(windowId);

        if (!this.windowStates.has(windowId)) {
            const state = new WindowState(windowId, snapshot);
            this.windowStates.set(windowId, state);
        } else {
            // Update snapshot if re-queued (state already exists)
            const state = this.windowStates.get(windowId)!;
            state.update(snapshot);
        }

        // If window is currently active, notify listeners that it was re-queued (new data available)
        if (this.activeWindows.has(windowId)) {
            if (this.onWindowRequeued) {
                this.onWindowRequeued(windowId);
            }
        }

        // Persist snapshot immediately to prevent false "window changed" detections
        // during queue waits (e.g., when other windows are processing)
        await StateService.updateWindowSnapshot(windowId, snapshot);

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
