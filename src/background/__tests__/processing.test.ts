
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessingState } from '../processing';
import { WindowSnapshot } from '../../utils/snapshots';
import { MockWindowSnapshot } from './testUtils';


describe('ProcessingState', () => {
    const defaultTabs: chrome.tabs.Tab[] = [];
    const defaultGroups: chrome.tabGroups.TabGroup[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        // Spy on static fetch
        vi.spyOn(WindowSnapshot, 'fetch').mockResolvedValue(new MockWindowSnapshot(defaultTabs, defaultGroups));
    });

    it('should initialize with no processing', () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);
        expect(state.isProcessing).toBe(false);
        expect(state.size).toBe(0);
    });

    it('should update status and fire callback when adding items', async () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        const added = await state.add(10);
        expect(added).toBe(true);
        expect(state.isProcessing).toBe(true);
        expect(callback).toHaveBeenCalledWith(true);
        expect(state.size).toBe(1);
    });

    it('should handle priority (move to front) when adding existing window', async () => {
        const state = new ProcessingState(() => { });

        await state.add(10);
        await state.add(20);
        expect(state.acquireQueue()).toEqual([20, 10]); // LIFO-ish (prepend)

        state.release();
        await state.add(10);
        await state.add(20);
        await state.add(30);
        // Queue is [30, 20, 10]

        // Re-add 10 -> should move to front
        await state.add(10);
        expect(state.acquireQueue()).toEqual([10, 30, 20]);
    });

    it('should not fire callback if status does not change', async () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        await state.add(10);
        expect(callback).toHaveBeenCalledTimes(1);

        await state.add(20);
        expect(callback).toHaveBeenCalledTimes(1); // Still processing
        expect(state.size).toBe(2);
    });

    it('should handle acquireQueue', async () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        await state.add(10);
        await state.add(20);

        callback.mockClear();

        const windowIds = state.acquireQueue();
        expect(windowIds).toEqual([20, 10]);
        expect(state.size).toBe(0);
        expect(state.isBusy).toBe(true);
    });

    it('should return empty if acquireQueue called while busy', async () => {
        const state = new ProcessingState(() => { });

        await state.add(10);
        state.acquireQueue();

        await state.add(20);
        const ids = state.acquireQueue();
        expect(ids).toEqual([]);
        expect(state.size).toBe(1);
    });

    it('should update status when released', async () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        await state.add(10);
        state.acquireQueue();
        callback.mockClear();

        state.release();
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    it('should handle remove correctly', async () => {
        const callback = vi.fn();
        const state = new ProcessingState(callback);

        await state.add(10);
        await state.add(20);
        callback.mockClear();

        state.remove(10);
        expect(state.size).toBe(1);
        expect(state.isProcessing).toBe(true);
        expect(callback).not.toHaveBeenCalled();

        state.remove(20);
        expect(state.isProcessing).toBe(false);
        expect(callback).toHaveBeenCalledWith(false);
    });

    describe('Snapshotting', () => {
        const tabs: chrome.tabs.Tab[] = [
            { id: 101, url: 'https://a.com', title: 'A' } as any,
            { id: 102, url: 'https://b.com', title: 'B' } as any
        ];
        const groups: chrome.tabGroups.TabGroup[] = [
            { id: 1, title: 'Group 1' } as any
        ];

        it('should verify matching snapshot', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups);
            // First call for within add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot);
            // Second call for verifySnapshot() - same snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot);

            const state = new ProcessingState(() => { });
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(true);
        });

        it('should fail verification if tabs are different', async () => {
            // First call for add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new (WindowSnapshot as any)(tabs, groups));

            const differentTabs = [tabs[0], { ...tabs[1], id: 103, url: 'https://c.com', title: 'C' }];
            // Second call for verifySnapshot() - different snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(differentTabs, groups));

            const state = new ProcessingState(() => { });
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should fail verification if groups are different', async () => {
            // First call for add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new (WindowSnapshot as any)(tabs, groups));

            const differentGroups = [{ ...groups[0], title: 'Renamed Group' }];
            // Second call for verifySnapshot() - different snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(tabs, differentGroups));

            const state = new ProcessingState(() => { });
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should reconstruct tab and group data from snapshot', async () => {
            // Needed to construct new WindowSnapshot with data
            vi.mocked(WindowSnapshot.fetch).mockResolvedValue(new MockWindowSnapshot(tabs, groups));

            const state = new ProcessingState(() => { });
            await state.add(10);

            expect((state.getWindowState(10)!.inputSnapshot as any).tabs).toEqual([
                { id: 101, url: 'https://a.com', title: 'A' },
                { id: 102, url: 'https://b.com', title: 'B' }
            ]);
            expect((state.getWindowState(10)!.inputSnapshot as any).groups).toEqual([
                { id: 1, title: 'Group 1' }
            ]);
        });

        it('should isolate snapshots by window', async () => {
            const snapshot10 = new MockWindowSnapshot(tabs, groups);
            const snapshot20 = new MockWindowSnapshot(
                [{ id: 99, url: 'https://z.com', title: 'Z' } as any],
                []
            );

            // 1. Add(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            // 2. Add(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);
            // 3. Verify(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            // 4. Verify(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);

            const state = new ProcessingState(() => { });
            await state.add(10);
            await state.add(20);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(true);
            expect(await state.getWindowState(20)!.verifySnapshot()).toBe(true);
        });

        it('should allow completing a specific window', async () => {
            const state = new ProcessingState(() => { });

            await state.add(10);
            state.acquireQueue();
            await state.add(20);

            await state.completeWindow(10);
            expect(state.has(10)).toBe(false);
            expect(state.has(20)).toBe(true);
        });

        it('should retain state if window is re-queued', async () => {
            const state = new ProcessingState(() => { });

            // 1. Add(10)
            await state.add(10);
            expect(state.has(10)).toBe(true);

            // 2. Simulate QueueProcessor acquiring queue (clears queue)
            state.acquireQueue();

            // 3. Re-queue(10)
            await state.add(10);
            expect(state.size).toBe(1); // Back in queue

            // 4. Complete(10) - simulating completion of FIRST add
            await state.completeWindow(10);

            // 5. State should still be present because it's re-queued
            expect(state.has(10)).toBe(true);
        });
    });
});
