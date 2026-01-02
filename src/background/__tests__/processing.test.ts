
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessingState } from '../processing';
import { WindowSnapshot } from '../../utils/snapshots';
import { MockWindowSnapshot } from './testUtils';
import { StateService } from '../state';

// Mock StateService
vi.mock('../state', () => ({
    StateService: {
        setProcessingWindows: vi.fn().mockResolvedValue(undefined),
        updateWindowSnapshot: vi.fn().mockResolvedValue(undefined),
        getWindowSnapshot: vi.fn(),
        clearWindowSnapshot: vi.fn(),
        clearProcessingStatus: vi.fn(),
        hydrate: vi.fn(),
        persist: vi.fn(),
    }
}));

describe('ProcessingState', () => {
    const defaultTabs: chrome.tabs.Tab[] = [];
    const defaultGroups: chrome.tabGroups.TabGroup[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        // Spy on static fetch
        vi.spyOn(WindowSnapshot, 'fetch').mockResolvedValue(new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot);
    });

    it('should initialize with no processing', () => {
        const state = new ProcessingState();
        expect(state.isProcessing).toBe(false);
        expect(state.size).toBe(0);
    });

    it('should update status and sync to storage when adding items', async () => {
        const state = new ProcessingState();

        const added = await state.add(10);
        expect(added).toBe(true);
        expect(state.isProcessing).toBe(true);
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([10]);
        expect(state.size).toBe(1);
    });

    it('should handle priority (move to front) when adding existing window', async () => {
        const state = new ProcessingState();

        await state.add(10, true);
        await state.add(20, true);
        // Queue is [20, 10] (LIFO due to unshift for high priority)
        expect(state.acquireQueue()).toEqual([20, 10]);

        await state.add(10, false);
        await state.add(20, false);
        await state.add(30, false);
        // Queue is [10, 20, 30] (FIFO for low priority)
        expect(state.acquireQueue()).toEqual([10, 20, 30]);

        // Mixed priorities
        await state.add(10, false); // Low
        await state.add(20, true);  // High
        // 20 should be first, 10 second
        expect(state.acquireQueue()).toEqual([20, 10]);
    });

    it('should not sync if status does not change', async () => {
        const state = new ProcessingState();

        await state.add(10);
        expect(StateService.setProcessingWindows).toHaveBeenCalledTimes(1);

        await state.add(20);
        expect(StateService.setProcessingWindows).toHaveBeenCalledTimes(2); // Updates with [20, 10]
        expect(state.size).toBe(2);
    });

    it('should handle acquireQueue', async () => {
        const state = new ProcessingState();

        await state.add(10);
        await state.add(20);

        vi.mocked(StateService.setProcessingWindows).mockClear();

        const windowIds = state.acquireQueue();
        expect(windowIds).toEqual([20, 10]);
        expect(state.size).toBe(2);
        expect(state.isBusy).toBe(true);
    });

    it('should return pending items if acquireQueue called while busy', async () => {
        const state = new ProcessingState();

        await state.add(10);
        state.acquireQueue();

        await state.add(20);
        const ids = state.acquireQueue();
        // Since we allow concurrent processing (QueueProcessor manages flow), we expect [20]
        expect(ids).toEqual([20]);
        expect(state.size).toBe(2); // 10 active + 20 active
    });

    it('should update status when completed', async () => {
        const state = new ProcessingState();

        await state.add(10);
        state.acquireQueue();
        vi.mocked(StateService.setProcessingWindows).mockClear();

        await state.completeWindow(10);
        expect(state.isProcessing).toBe(false);
        // Should sync empty
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([]);
    });

    it('should handle remove correctly', async () => {
        const state = new ProcessingState();

        await state.add(10);
        await state.add(20);
        vi.mocked(StateService.setProcessingWindows).mockClear();

        state.remove(10);
        expect(state.size).toBe(1);
        expect(state.isProcessing).toBe(true);
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([20]);

        state.remove(20);
        expect(state.isProcessing).toBe(false);
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([]);
    });

    describe('Snapshotting', () => {
        const tabs: chrome.tabs.Tab[] = [
            { id: 101, url: 'https://a.com', title: 'A' } as unknown as chrome.tabs.Tab,
            { id: 102, url: 'https://b.com', title: 'B' } as unknown as chrome.tabs.Tab
        ];
        const groups: chrome.tabGroups.TabGroup[] = [
            { id: 1, title: 'Group 1' } as unknown as chrome.tabGroups.TabGroup
        ];

        it('should verify matching snapshot', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;
            // First call for within add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot);
            // Second call for verifySnapshot() - same snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot);

            const state = new ProcessingState();
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(true);
        });

        it('should fail verification if tabs are different', async () => {
            // First call for add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot);

            const differentTabs = [tabs[0], { ...tabs[1], id: 103, url: 'https://c.com', title: 'C' } as unknown as chrome.tabs.Tab];
            // Second call for verifySnapshot() - different snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(differentTabs, groups) as unknown as WindowSnapshot);

            const state = new ProcessingState();
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should fail verification if groups are different', async () => {
            // First call for add()
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot);

            const differentGroups = [{ ...groups[0], title: 'Renamed Group' } as unknown as chrome.tabGroups.TabGroup];
            // Second call for verifySnapshot() - different snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(new MockWindowSnapshot(tabs, differentGroups) as unknown as WindowSnapshot);

            const state = new ProcessingState();
            await state.add(10);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should reconstruct tab and group data from snapshot', async () => {
            // Needed to construct new WindowSnapshot with data
            vi.mocked(WindowSnapshot.fetch).mockResolvedValue(new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot);

            const state = new ProcessingState();
            await state.add(10);

            // @ts-expect-error - Accessing private or internal data
            expect(state.getWindowState(10)!.inputSnapshot.tabs).toEqual([
                { id: 101, url: 'https://a.com', title: 'A' },
                { id: 102, url: 'https://b.com', title: 'B' }
            ]);
            // @ts-expect-error - Accessing private or internal data
            expect(state.getWindowState(10)!.inputSnapshot.groups).toEqual([
                { id: 1, title: 'Group 1' }
            ]);
        });

        it('should isolate snapshots by window', async () => {
            const snapshot10 = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;
            const snapshot20 = new MockWindowSnapshot(
                [{ id: 99, url: 'https://z.com', title: 'Z' } as unknown as chrome.tabs.Tab],
                []
            ) as unknown as WindowSnapshot;

            // 1. Add(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            // 2. Add(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);
            // 3. Verify(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            // 4. Verify(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);

            const state = new ProcessingState();
            await state.add(10);
            await state.add(20);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(true);
            expect(await state.getWindowState(20)!.verifySnapshot()).toBe(true);
        });

        it('should allow completing a specific window', async () => {
            const state = new ProcessingState();

            await state.add(10);
            state.acquireQueue();
            await state.add(20);

            await state.completeWindow(10);
            expect(state.has(10)).toBe(false);
            expect(state.has(20)).toBe(true);
        });

        it('should retain state if window is re-queued', async () => {
            const state = new ProcessingState();

            // 1. Add(10)
            await state.add(10);
            expect(state.has(10)).toBe(true);

            // 2. Simulate QueueProcessor acquiring queue (clears queue)
            state.acquireQueue();

            // 3. Re-queue(10)
            await state.add(10);
            expect(state.size).toBe(2); // 1 active + 1 queued

            // 4. Complete(10) - simulating completion of FIRST add
            await state.completeWindow(10);

            // 5. State should still be present because it's re-queued
            expect(state.has(10)).toBe(true);
        });
    });
});
