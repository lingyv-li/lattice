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
    private windowStates = new Map<number, WindowState>();
    private _isBusy = false;
    private _lastEmittedState = false;
    private onStateChange: (isProcessing: boolean) => void;

    constructor(onStateChange: (isProcessing: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    private updateStatus() {
        const newState = this._isBusy || this.windowQueue.length > 0;

        if (newState !== this._lastEmittedState) {
            console.log(`[ProcessingState] Status changed: ${this._lastEmittedState} -> ${newState} (Busy: ${this._isBusy}, Windows: ${this.windowQueue.length})`);
            this._lastEmittedState = newState;
            this.onStateChange(newState);
        }
    }

    get isProcessing(): boolean {
        return this._isBusy || this.windowQueue.length > 0;
    }

    get isBusy(): boolean {
        return this._isBusy;
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

        // If the window was re-queued while processing (e.g. rapid changes),
        // do NOT delete the state, so the next processor cycle can find it.
        if (this.windowQueue.includes(windowId)) {
            console.log(`[ProcessingState] Window ${windowId} is re-queued, keeping state.`);
            return;
        }

        this.windowStates.delete(windowId);
    }

    get size(): number {
        return this.windowQueue.length;
    }

    get hasItems(): boolean {
        return this.windowQueue.length > 0;
    }

    /**
     * Add a window for processing. If it already exists, move it to the front (Priority).
     * Captures the snapshot at enqueue time to ensure consistency.
     * Uses centralized fetchWindowSnapshotData to ensure consistent schema.
     */
    async add(windowId: number): Promise<boolean> {
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

        // Persist snapshot immediately to prevent false "window changed" detections
        // during queue waits (e.g., when other windows are processing)
        await StateService.updateWindowSnapshot(windowId, snapshot);

        if (existingIndex !== -1) {
            // Priority: Move to front if already exists
            if (existingIndex > 0) {
                this.windowQueue.splice(existingIndex, 1);
                this.windowQueue.unshift(windowId);
            }
            return false;
        }

        // New window: Prepend for priority
        this.windowQueue.unshift(windowId);
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
        if (this._isBusy) return [];

        this._isBusy = true;

        const workQueue = [...this.windowQueue];
        this.windowQueue = [];

        console.log(`[ProcessingState] Acquired queue: ${workQueue.length} windows`);
        this.updateStatus();
        return workQueue;
    }

    release() {
        console.log(`[ProcessingState] Releasing lock`);
        this._isBusy = false;
        this.updateStatus();
    }

    remove(windowId: number): boolean {
        const index = this.windowQueue.indexOf(windowId);
        if (index !== -1) {
            this.windowQueue.splice(index, 1);
            this.updateStatus();
            return true;
        }
        return false;
    }

    clear() {
        this.windowQueue = [];
        this.windowStates.clear();
        this._isBusy = false;
        this.updateStatus();
    }
}
