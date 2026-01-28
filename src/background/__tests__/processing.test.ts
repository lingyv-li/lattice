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
        persist: vi.fn()
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
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        const added = await state.enqueue(10, snapshot);
        expect(added).toBe(true);
        expect(state.isProcessing).toBe(true);
        // Snapshot persistence is deferred until completion
        expect(StateService.updateWindowSnapshot).not.toHaveBeenCalled();
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([10]);
        expect(state.size).toBe(1);
    });

    it('should handle priority (move to front) when adding existing window', async () => {
        const state = new ProcessingState();
        const snapshot1 = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;
        // Identical content but different fingerprint to force update

        // Mock equals to return false to simulate change
        vi.spyOn(snapshot1, 'equals').mockReturnValue(false);

        await state.enqueue(10, snapshot1, true);
        await state.enqueue(20, snapshot1, true);
        // Queue is [20, 10]
        expect(state.acquireQueue()).toEqual([20, 10]);

        // To force move, we must provide a snapshot that is considered "different" OR explicitly new
        // Since dedupe logic prevents re-queueing identical snapshots, we mock 'equals' to false for the stored snapshot
        // Access stored state to mock its snapshot
        const state10 = state.getWindowState(10)!;
        vi.spyOn(state10.inputSnapshot, 'equals').mockReturnValue(false);

        const state20 = state.getWindowState(20)!;
        vi.spyOn(state20.inputSnapshot, 'equals').mockReturnValue(false);

        await state.enqueue(10, snapshot1, false);
        await state.enqueue(20, snapshot1, false);
        await state.enqueue(30, snapshot1, false);

        // Queue is [10, 20, 30] (10 and 20 moved to back because they were "updated")
        expect(state.acquireQueue()).toEqual([10, 20, 30]);
    });

    it('should not sync if status does not change', async () => {
        const state = new ProcessingState();
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        await state.enqueue(10, snapshot);
        expect(StateService.setProcessingWindows).toHaveBeenCalledTimes(1);

        // Re-queue same window (deduped)
        await state.enqueue(10, snapshot);
        expect(StateService.setProcessingWindows).toHaveBeenCalledTimes(1);

        await state.enqueue(20, snapshot);
        expect(StateService.setProcessingWindows).toHaveBeenCalledTimes(2);
        expect(state.size).toBe(2);
    });

    it('should handle acquireQueue', async () => {
        const state = new ProcessingState();
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        await state.enqueue(10, snapshot);
        await state.enqueue(20, snapshot);

        const queue = state.acquireQueue();
        expect(queue).toEqual([20, 10]); // LIFO because default is High Priority (unshift)
        // Queue should be empty after acquire
        expect(state.acquireQueue()).toEqual([]);
        // Items should be active
        expect(state.isProcessing).toBe(true);
    });

    it('should return pending items if acquireQueue called while busy', async () => {
        const state = new ProcessingState();
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        await state.enqueue(10, snapshot);
        state.acquireQueue();

        await state.enqueue(20, snapshot);
        const ids = state.acquireQueue();
        expect(ids).toEqual([20]);
        expect(state.size).toBe(2);
    });

    it('should update status when completed', async () => {
        const state = new ProcessingState();
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        await state.enqueue(10, snapshot);
        state.acquireQueue();
        vi.mocked(StateService.setProcessingWindows).mockClear();

        await state.completeWindow(10);
        expect(state.isProcessing).toBe(false);
        expect(StateService.setProcessingWindows).toHaveBeenCalledWith([]);
    });

    it('should handle remove correctly', async () => {
        const state = new ProcessingState();
        const snapshot = new MockWindowSnapshot(defaultTabs, defaultGroups) as unknown as WindowSnapshot;

        await state.enqueue(10, snapshot);
        await state.enqueue(20, snapshot);

        state.remove(10);

        const queue = state.acquireQueue();
        expect(queue).toEqual([20]);
        expect(state.has(10)).toBe(false);
    });

    describe('Snapshotting', () => {
        // Fix: Add necessary properties for isGroupableTab (groupId: -1, status: 'complete')
        const tabs: chrome.tabs.Tab[] = [
            {
                id: 101,
                url: 'https://a.com',
                title: 'A',
                groupId: -1,
                status: 'complete',
                windowId: 10
            } as unknown as chrome.tabs.Tab,
            {
                id: 102,
                url: 'https://b.com',
                title: 'B',
                groupId: -1,
                status: 'complete',
                windowId: 10
            } as unknown as chrome.tabs.Tab
        ];
        const groups: chrome.tabGroups.TabGroup[] = [{ id: 1, title: 'Group 1', windowId: 10 } as unknown as chrome.tabGroups.TabGroup];

        it('should verify matching snapshot', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;
            // Mock fetch to return same snapshot
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot);

            const state = new ProcessingState();
            await state.enqueue(10, snapshot);

            const valid = await state.getWindowState(10)!.verifySnapshot();
            expect(valid).toBe(true);
        });

        it('should fail verification if groups are different', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;

            const differentGroups = [{ ...groups[0], title: 'Modified Group' } as unknown as chrome.tabGroups.TabGroup];
            const newSnapshot = new MockWindowSnapshot(tabs, differentGroups) as unknown as WindowSnapshot;
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(newSnapshot);

            const state = new ProcessingState();
            await state.enqueue(10, snapshot);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should fail verification if tabs are different', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;

            const differentTabs = [
                tabs[0],
                {
                    ...tabs[1],
                    id: 103,
                    url: 'https://c.com',
                    title: 'C',
                    groupId: -1,
                    status: 'complete',
                    windowId: 10
                } as unknown as chrome.tabs.Tab
            ];
            // Call for verifySnapshot() - different snapshot
            // Ensure verifySnapshot gets a different snapshot instance that produces different fingerprint
            const newSnapshot = new MockWindowSnapshot(differentTabs, groups) as unknown as WindowSnapshot;
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(newSnapshot);

            const state = new ProcessingState();
            await state.enqueue(10, snapshot);

            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(false);
        });

        it('should reconstruct tab and group data from snapshot', async () => {
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;

            const state = new ProcessingState();
            await state.enqueue(10, snapshot);

            expect(state.getWindowState(10)!.inputSnapshot.getGroupableTabs()).toHaveLength(2);
            expect(state.getWindowState(10)!.inputSnapshot.getGroupableTabs()[0].id).toBe(101);
        });

        it('should isolate snapshots by window', async () => {
            const snapshot10 = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;
            const snapshot20 = new MockWindowSnapshot(
                [
                    {
                        id: 99,
                        url: 'https://z.com',
                        title: 'Z',
                        groupId: -1,
                        status: 'complete',
                        windowId: 20
                    } as unknown as chrome.tabs.Tab
                ],
                []
            ) as unknown as WindowSnapshot;

            // 1. Add(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            // 2. Add(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);

            const state = new ProcessingState();
            await state.enqueue(10, snapshot10);
            await state.enqueue(20, snapshot20);

            // 3. Verify(10)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot10);
            expect(await state.getWindowState(10)!.verifySnapshot()).toBe(true);

            // 4. Verify(20)
            vi.mocked(WindowSnapshot.fetch).mockResolvedValueOnce(snapshot20);
            expect(await state.getWindowState(20)!.verifySnapshot()).toBe(true);
        });

        it('should allow completing a specific window', async () => {
            const state = new ProcessingState();
            const snapshot = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;

            await state.enqueue(10, snapshot);
            state.acquireQueue();
            await state.enqueue(20, snapshot);

            await state.completeWindow(10);
            expect(state.has(10)).toBe(false);
            expect(state.has(20)).toBe(true);
        });

        it('should retain state if window is re-queued', async () => {
            const state = new ProcessingState();
            const snapshot1 = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;

            // 1. Add(10)
            await state.enqueue(10, snapshot1);
            expect(state.has(10)).toBe(true);

            // 2. Simulate QueueProcessor acquiring queue (clears queue)
            state.acquireQueue();

            // 3. Re-queue(10) with "New Version" to pass dedupe
            const snapshot2 = new MockWindowSnapshot(tabs, groups) as unknown as WindowSnapshot;
            // Force equality check to fail
            vi.spyOn(snapshot1, 'equals').mockReturnValue(false);

            await state.enqueue(10, snapshot2);
            expect(state.size).toBe(2); // 1 active + 1 queued

            // 4. Complete(10) - simulating completion of FIRST add
            await state.completeWindow(10);

            // 5. State should still be present because it's re-queued
            expect(state.has(10)).toBe(true);
        });
    });
});
