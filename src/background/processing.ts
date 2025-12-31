export class ProcessingState {
    private queue = new Set<number>();
    private _isBusy = false;
    private _isStale = false;
    private _lastEmittedState = false;
    private onStateChange: (isProcessing: boolean) => void;

    constructor(onStateChange: (isProcessing: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    private updateStatus() {
        const newState = this._isBusy || this.queue.size > 0;

        if (newState !== this._lastEmittedState) {
            console.log(`[ProcessingState] Status changed: ${this._lastEmittedState} -> ${newState} (Busy: ${this._isBusy}, Queue: ${this.queue.size})`);
            this._lastEmittedState = newState;
            this.onStateChange(newState);
        }
    }

    get isProcessing(): boolean {
        return this._isBusy || this.queue.size > 0;
    }

    get isBusy(): boolean {
        return this._isBusy;
    }

    get isStale(): boolean {
        return this._isStale;
    }

    get size(): number {
        return this.queue.size;
    }

    get hasItems(): boolean {
        return this.queue.size > 0;
    }

    add(tabId: number): boolean {
        if (!this.queue.has(tabId)) {
            this.queue.add(tabId);
            if (this._isBusy) {
                this._isStale = true;
                console.log(`[ProcessingState] New items added during busy state, marked as STALE`);
            }
            this.updateStatus();
            return true;
        }
        return false;
    }

    has(tabId: number): boolean {
        return this.queue.has(tabId);
    }

    // Lock and get all items
    acquireQueue(): number[] {
        if (this._isBusy) {
            console.log(`[ProcessingState] acquireQueue blocked: Busy`);
            return [];
        }

        this._isBusy = true;
        this._isStale = false; // Reset staleness for new acquisition
        const ids = Array.from(this.queue);
        this.queue.clear();
        console.log(`[ProcessingState] Acquired queue: ${ids.length} items`);
        this.updateStatus();
        return ids;
    }

    release() {
        console.log(`[ProcessingState] Releasing lock`);
        this._isBusy = false;
        this.updateStatus();
    }

    remove(tabId: number): boolean {
        const changed = this.queue.delete(tabId);
        if (changed) {
            if (this._isBusy) this._isStale = true;
            this.updateStatus();
        }
        return changed;
    }

    clear() {
        if (this._isBusy) this._isStale = true;
        this.queue.clear();
        this._isBusy = false;
        this.updateStatus();
    }
}
