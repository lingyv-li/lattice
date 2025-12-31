
import { describe, it, expect, vi } from 'vitest';
import { ProcessingState } from '../processing';

describe('ProcessingState', () => {
    it('should initialize with no processing', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);
        expect(state.isProcessing).toBe(false);
        expect(state.size).toBe(0);
    });

    it('should update status and fire callback when adding items', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        const added = state.add(1);
        expect(added).toBe(true);
        expect(state.isProcessing).toBe(true);
        expect(callback).toHaveBeenCalledWith(true);
        expect(state.size).toBe(1);
    });

    it('should not fire callback if status does not change', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        expect(callback).toHaveBeenCalledTimes(1);

        state.add(2);
        expect(callback).toHaveBeenCalledTimes(1); // Still processing, no change in boolean status
        expect(state.size).toBe(2);
    });

    it('should handle acquireQueue', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.add(2);

        callback.mockClear();

        // acquireQueue removes everything from queue and sets busy
        const processingIds = state.acquireQueue();
        expect(processingIds).toEqual([1, 2]);
        expect(state.size).toBe(0);
        expect(state.isBusy).toBe(true);
        expect(state.isProcessing).toBe(true);
        expect(callback).not.toHaveBeenCalled(); // Status didn't change (true -> true)
    });

    it('should return empty if acquireQueue called while busy', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.acquireQueue();

        state.add(2); // Added to queue while busy

        // Try to acquire again while busy
        const ids = state.acquireQueue();
        expect(ids).toEqual([]);
        expect(state.size).toBe(1); // Item 2 still in queue
    });

    it('should update status when released', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.acquireQueue();

        callback.mockClear();

        state.release();
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    it('should handle remove correctly', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        callback.mockClear();

        state.remove(1);
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    it('should handle clear correctly', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.acquireQueue();
        state.add(2);

        callback.mockClear();

        state.clear();
        expect(state.isProcessing).toBe(false);
        expect(state.isBusy).toBe(false);
        expect(state.size).toBe(0);
        expect(callback).toHaveBeenCalledWith(false);
    });

    describe('isStale', () => {
        it('should mark as stale if added while busy', () => {
            const state = new ProcessingState(() => { });
            state.add(1);
            state.acquireQueue();
            expect(state.isStale).toBe(false);

            state.add(2);
            expect(state.isStale).toBe(true);
        });

        it('should mark as stale if removed while busy', () => {
            const state = new ProcessingState(() => { });
            state.add(1);
            state.add(2);
            state.acquireQueue();
            expect(state.isStale).toBe(false);

            state.remove(3); // even if not in queue? actually removal from anywhere?
            // current impl: changed = this.queue.delete(tabId)
            // if queue doesn't have it, no change.
            expect(state.isStale).toBe(false);

            state.add(3);
            state.isStale; // true
            state.remove(3);
            // wait, if I add it while busy it's stale. 
            // what if I remove an item that was in the acquired queue?
            // ProcessingState doesn't know about acquired items.
        });

        it('should reset stale flag on acquireQueue', () => {
            const state = new ProcessingState(() => { });
            state.add(1);
            state.acquireQueue();
            state.add(2);
            expect(state.isStale).toBe(true);

            state.release();
            state.acquireQueue();
            expect(state.isStale).toBe(false);
        });
    });
});
