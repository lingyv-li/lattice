
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

        const added = state.add(10);
        expect(added).toBe(true);
        expect(state.isProcessing).toBe(true);
        expect(callback).toHaveBeenCalledWith(true);
        expect(state.size).toBe(1);
    });

    it('should handle priority (move to front) when adding existing window', () => {
        const state = new ProcessingState(() => { });
        state.add(10);
        state.add(20);
        expect(state.acquireQueue()).toEqual([20, 10]); // LIFO-ish (prepend)

        state.release();
        state.add(10);
        state.add(20);
        state.add(30);
        // Queue is [30, 20, 10]

        // Re-add 10 -> should move to front
        state.add(10);
        expect(state.acquireQueue()).toEqual([10, 30, 20]);
    });

    it('should not fire callback if status does not change', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(10);
        expect(callback).toHaveBeenCalledTimes(1);

        state.add(20);
        expect(callback).toHaveBeenCalledTimes(1); // Still processing
        expect(state.size).toBe(2);
    });

    it('should handle acquireQueue', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(10);
        state.add(20);

        callback.mockClear();

        const windowIds = state.acquireQueue();
        expect(windowIds).toEqual([20, 10]);
        expect(state.size).toBe(0);
        expect(state.isBusy).toBe(true);
    });

    it('should return empty if acquireQueue called while busy', () => {
        const state = new ProcessingState(() => { });
        state.add(10);
        state.acquireQueue();

        state.add(20);
        const ids = state.acquireQueue();
        expect(ids).toEqual([]);
        expect(state.size).toBe(1);
    });

    it('should update status when released', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(10);
        state.acquireQueue();
        callback.mockClear();

        state.release();
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    it('should handle remove correctly', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        state.add(10);
        state.add(20);
        callback.mockClear();

        state.remove(10);
        expect(state.size).toBe(1);
        expect(state.isProcessing).toBe(true);
        expect(callback).not.toHaveBeenCalled();

        state.remove(20);
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    describe('Staleness', () => {
        it('should mark a window as stale if added while busy', () => {
            const state = new ProcessingState(() => { });
            state.add(10);
            state.acquireQueue();

            state.add(20);
            expect(state.isWindowStale(20)).toBe(true);
            expect(state.isWindowStale(10)).toBe(false);
        });

        it('should mark a window as stale if RE-added while busy', () => {
            const state = new ProcessingState(() => { });
            state.add(10);
            state.acquireQueue(); // State is now processing 10

            state.add(10); // 10 is updated while being processed
            expect(state.isWindowStale(10)).toBe(true);
        });

        it('should reset stale windows on acquireQueue', () => {
            const state = new ProcessingState(() => { });
            state.add(10);
            state.acquireQueue();
            state.add(10);
            expect(state.isWindowStale(10)).toBe(true);

            state.release();
            state.acquireQueue(); // Should clear staleness
            expect(state.isWindowStale(10)).toBe(false);
        });

        it('should allow completing a specific window', () => {
            const state = new ProcessingState(() => { });
            state.add(10);
            state.acquireQueue();
            state.add(10);
            state.add(20);

            expect(state.isWindowStale(10)).toBe(true);
            expect(state.isWindowStale(20)).toBe(true);

            state.completeWindow(10);
            expect(state.isWindowStale(10)).toBe(false);
            expect(state.has(10)).toBe(false);
            expect(state.isWindowStale(20)).toBe(true);
        });

        describe('Snapshotting', () => {
            const tabs: chrome.tabs.Tab[] = [
                { id: 101, url: 'https://a.com', title: 'A' } as any,
                { id: 102, url: 'https://b.com', title: 'B' } as any
            ];
            const groups: chrome.tabGroups.TabGroup[] = [
                { id: 1, title: 'Group 1' } as any
            ];

            it('should verify matching snapshot', () => {
                const state = new ProcessingState(() => { });
                state.add(10);
                state.updateSnapshot(10, tabs, groups);

                expect(state.verifySnapshot(10, tabs, groups)).toBe(true);
            });

            it('should fail verification if tabs are different', () => {
                const state = new ProcessingState(() => { });
                state.add(10);
                state.updateSnapshot(10, tabs, groups);

                const differentTabs = [
                    { id: 101, url: 'https://a.com', title: 'A' } as any,
                    { id: 103, url: 'https://c.com', title: 'C' } as any
                ];
                expect(state.verifySnapshot(10, differentTabs, groups)).toBe(false);
            });

            it('should fail verification if groups are different', () => {
                const state = new ProcessingState(() => { });
                state.add(10);
                state.updateSnapshot(10, tabs, groups);

                const differentGroups = [
                    { id: 1, title: 'Renamed Group' } as any
                ];
                expect(state.verifySnapshot(10, tabs, differentGroups)).toBe(false);
            });

            it('should reconstruct tab and group data from snapshot', () => {
                const state = new ProcessingState(() => { });
                state.add(10);
                state.updateSnapshot(10, tabs, groups);

                expect(state.getSnapshotTabs(10)).toEqual([
                    { id: 101, url: 'https://a.com', title: 'A' },
                    { id: 102, url: 'https://b.com', title: 'B' }
                ]);
                expect(state.getSnapshotGroups(10)).toEqual([
                    { id: 1, title: 'Group 1' }
                ]);
            });

            it('should isolate snapshots by window', () => {
                const state = new ProcessingState(() => { });
                state.add(10);
                state.add(20);
                state.updateSnapshot(10, tabs, groups);
                state.updateSnapshot(20, [{ id: 99, url: 'https://z.com', title: 'Z' } as any], []);

                expect(state.verifySnapshot(10, tabs, groups)).toBe(true);
                expect(state.verifySnapshot(20, tabs, groups)).toBe(false);
            });
        });
    });
});
