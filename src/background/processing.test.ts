
import { describe, it, expect, vi } from 'vitest';
import { ProcessingState } from './processing';

describe('ProcessingState', () => {
    it('should initialize with no processing', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);
        expect(state.isProcessing).toBe(false);
        expect(state.size).toBe(0);
        expect(state.processingSize).toBe(0);
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

    it('should handle startProcessing', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.add(2);

        callback.mockClear();

        const processingIds = state.startProcessing();
        expect(processingIds).toEqual([1, 2]);
        expect(state.size).toBe(0);
        expect(state.processingSize).toBe(2);
        expect(state.isProcessing).toBe(true);
        expect(callback).not.toHaveBeenCalled(); // Status didn't change (true -> true)
    });

    it('should update status when all items finish', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(1);
        state.startProcessing();

        callback.mockClear();

        state.finish(1);
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
        expect(state.processingSize).toBe(0);
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
        state.startProcessing();
        state.add(2);

        callback.mockClear();

        state.clear();
        expect(state.isProcessing).toBe(false);
        expect(state.size).toBe(0);
        expect(state.processingSize).toBe(0);
        expect(callback).toHaveBeenCalledWith(false);
    });
});
