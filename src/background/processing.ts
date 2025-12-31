/**
 * Encapsulates the processing status of a single window.
 */
class WindowState {
    private _inputSnapshot: string = '';
    private _snapshotTabs: { id: number; title: string; url: string }[] = [];
    private _snapshotGroups: { id: number; title: string }[] = [];

    constructor(public readonly id: number, private _isStale: boolean = false) { }

    get isStale(): boolean {
        return this._isStale;
    }

    markStale() {
        this._isStale = true;
    }

    markClean() {
        this._isStale = false;
    }

    /**
     * Creates a string snapshot of the current state (tabs + groups) in the window.
     * Captures IDs, URLs, and titles to detect any relevant changes.
     */
    updateSnapshot(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        // Store structured data for AI prompts
        this._snapshotTabs = tabs.map(t => ({
            id: t.id!,
            title: t.title || '',
            url: t.url || ''
        }));
        this._snapshotGroups = groups.map(g => ({
            id: g.id,
            title: g.title || ''
        }));

        // Generate comparison string
        const tabPart = tabs
            .map(t => `${t.id}:${t.url}:${t.title}`)
            .sort()
            .join('|');
        const groupPart = groups
            .map(g => `${g.id}:${g.title}`)
            .sort()
            .join('|');

        this._inputSnapshot = `${tabPart}#${groupPart}`;
        this._isStale = false;
    }

    /**
     * Verifies if the current state matches the last snapshot.
     */
    verifySnapshot(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): boolean {
        const tabPart = tabs
            .map(t => `${t.id}:${t.url}:${t.title}`)
            .sort()
            .join('|');
        const groupPart = groups
            .map(g => `${g.id}:${g.title}`)
            .sort()
            .join('|');

        const current = `${tabPart}#${groupPart}`;
        return current === this._inputSnapshot;
    }

    get snapshotTabs() { return this._snapshotTabs; }
    get snapshotGroups() { return this._snapshotGroups; }
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


    isWindowStale(windowId: number): boolean {
        return this.windowStates.get(windowId)?.isStale ?? false;
    }

    updateSnapshot(windowId: number, tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        this.windowStates.get(windowId)?.updateSnapshot(tabs, groups);
    }

    verifySnapshot(windowId: number, tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): boolean {
        const state = this.windowStates.get(windowId);
        if (!state) return false;
        return state.verifySnapshot(tabs, groups);
    }

    getSnapshotTabs(windowId: number) {
        return this.windowStates.get(windowId)?.snapshotTabs ?? [];
    }

    getSnapshotGroups(windowId: number) {
        return this.windowStates.get(windowId)?.snapshotGroups ?? [];
    }

    /**
     * Marks a window processing as complete and clean.
     */
    completeWindow(windowId: number) {
        console.log(`[ProcessingState] Window ${windowId} completed`);
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
     */
    add(windowId: number): boolean {
        const existingIndex = this.windowQueue.indexOf(windowId);

        // Ensure we have a WindowState for this window
        let state = this.windowStates.get(windowId);
        if (!state) {
            state = new WindowState(windowId);
            this.windowStates.set(windowId, state);
        }

        if (existingIndex !== -1) {
            // Priority: Move to front if already exists
            if (existingIndex > 0) {
                this.windowQueue.splice(existingIndex, 1);
                this.windowQueue.unshift(windowId);
            }
            if (this._isBusy) {
                state.markStale();
                console.log(`[ProcessingState] Window ${windowId} re-added during busy state, marked as STALE`);
            }
            return false;
        }

        // New window: Prepend for priority
        this.windowQueue.unshift(windowId);

        if (this._isBusy) {
            state.markStale();
            console.log(`[ProcessingState] Window ${windowId} added during busy state, marked as STALE`);
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
        if (this._isBusy) {
            console.log(`[ProcessingState] acquireQueue blocked: Busy`);
            return [];
        }

        this._isBusy = true;

        // Reset staleness for acquired windows - they are now the "current" reality
        const workQueue = [...this.windowQueue];
        for (const id of workQueue) {
            this.windowStates.get(id)?.markClean();
        }

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
            const state = this.windowStates.get(windowId);
            if (this._isBusy && state) state.markStale();
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
