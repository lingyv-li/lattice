import { generateWindowSnapshot } from '../utils/snapshots';
import { StateService } from './state';

/**
 * Encapsulates the processing status of a single window.
 */
class WindowState {
    public inputSnapshot: string = '';
    public snapshotTabs: { id: number; title: string; url: string }[] = [];
    public snapshotGroups: { id: number; title: string }[] = [];

    constructor(
        public readonly id: number,
        public lastPersistentSnapshot: string | null = null
    ) { }

    /**
     * Creates a string snapshot of the current state (tabs + groups) in the window.
     * Captures IDs, URLs, and titles to detect any relevant changes.
     */
    updateSnapshot(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        this.snapshotTabs = tabs.map(t => ({
            id: t.id!,
            title: t.title || '',
            url: t.url || ''
        }));
        this.snapshotGroups = groups.map(g => ({
            id: g.id,
            title: g.title || ''
        }));

        this.inputSnapshot = generateWindowSnapshot(tabs, groups);
    }

    /**
     * Verifies if the current state matches the last snapshot.
     */
    verifySnapshot(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): boolean {
        return generateWindowSnapshot(tabs, groups) === this.inputSnapshot;
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
     */
    async isWindowChanged(windowId: number, tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): Promise<boolean> {
        const currentSnapshot = generateWindowSnapshot(tabs, groups);
        const state = this.windowStates.get(windowId);

        if (!state) {
            const lastPersistent = await StateService.getWindowSnapshot(windowId);
            const isChanged = currentSnapshot !== lastPersistent;
            if (isChanged) {
                console.log(`[ProcessingState] Window ${windowId} changed (no in-memory state):`);
                console.log(`  Previous: ${lastPersistent ?? '(none)'}`);
                console.log(`  Current:  ${currentSnapshot}`);
            }
            return isChanged;
        }

        const isChanged = currentSnapshot !== state.lastPersistentSnapshot;
        if (isChanged) {
            console.log(`[ProcessingState] Window ${windowId} changed:`);
            console.log(`  Previous: ${state.lastPersistentSnapshot ?? '(none)'}`);
            console.log(`  Current:  ${currentSnapshot}`);
        }
        return isChanged;
    }

    /**
     * Marks a window processing as complete and clean.
     * Persists the snapshot that was captured at enqueue time.
     */
    async completeWindow(windowId: number) {
        console.log(`[ProcessingState] Window ${windowId} completed`);

        const state = this.windowStates.get(windowId);
        if (state && state.inputSnapshot) {
            await StateService.updateWindowSnapshot(windowId, state.inputSnapshot);
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
     */
    add(windowId: number, tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): boolean {
        const existingIndex = this.windowQueue.indexOf(windowId);

        if (!this.windowStates.has(windowId)) {
            const state = new WindowState(windowId);
            state.updateSnapshot(tabs, groups);
            this.windowStates.set(windowId, state);
        } else {
            // Update snapshot if re-queued (state already exists)
            const state = this.windowStates.get(windowId)!;
            state.updateSnapshot(tabs, groups);
        }

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
