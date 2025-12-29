
export class ProcessingState {
    private queue = new Set<number>();
    private processing = new Set<number>();
    private onStateChange: (isProcessing: boolean) => void;
    private _isProcessing = false;

    constructor(onStateChange: (isProcessing: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    private updateStatus() {
        const newState = (this.queue.size + this.processing.size) > 0;
        if (this._isProcessing !== newState) {
            this._isProcessing = newState;
            this.onStateChange(newState);
        }
    }

    get isProcessing(): boolean {
        return this._isProcessing;
    }

    get size(): number {
        return this.queue.size;
    }

    get processingSize(): number {
        return this.processing.size;
    }

    add(tabId: number): boolean {
        if (!this.queue.has(tabId) && !this.processing.has(tabId)) {
            this.queue.add(tabId);
            this.updateStatus();
            return true;
        }
        return false;
    }

    has(tabId: number): boolean {
        return this.queue.has(tabId) || this.processing.has(tabId);
    }

    // Move items from queue to processing
    startProcessing(): number[] {
        const ids = Array.from(this.queue);
        this.queue.clear();
        for (const id of ids) {
            this.processing.add(id);
        }
        // Status likely remains true, but check anyway if queue was empty
        this.updateStatus();
        return ids;
    }

    finish(tabId: number) {
        this.processing.delete(tabId);
        // Also ensure it's removed from queue if it somehow got back in (rare but possible)
        this.queue.delete(tabId);
        this.updateStatus();
    }

    remove(tabId: number): boolean {
        let changed = false;
        if (this.queue.delete(tabId)) changed = true;
        if (this.processing.delete(tabId)) changed = true;
        if (changed) this.updateStatus();
        return changed;
    }

    clear() {
        this.queue.clear();
        this.processing.clear();
        this.updateStatus();
    }
}
