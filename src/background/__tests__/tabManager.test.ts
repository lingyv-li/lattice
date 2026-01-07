import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { TabManager } from '../tabManager';
import { StateService } from '../state';
import { ProcessingState } from '../processing';
import { QueueProcessor } from '../queueProcessor';
import { SettingsStorage, AppSettings } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import { WindowSnapshot } from '../../utils/snapshots';
import { MockWindowSnapshot } from './testUtils';
import { DuplicateCloser } from '../../services/duplicates';

// Mock dependencies
vi.mock('../state');
vi.mock('../processing');
vi.mock('../../utils/storage');
vi.mock('../../utils/snapshots');
vi.mock('../../services/duplicates', () => ({
    findDuplicates: vi.fn().mockReturnValue(new Map()),
    countDuplicates: vi.fn().mockReturnValue(0),
    DuplicateCloser: {
        isAutopilotEnabled: vi.fn().mockResolvedValue(false),
        closeDuplicatesInWindow: vi.fn().mockResolvedValue({ closedCount: 0, tabsRemoved: [] }),
        closeDuplicates: vi.fn()
    }
}));



describe('TabManager', () => {
    let tabManager: TabManager;
    let mockProcessingState: {
        enqueue: Mock;
        updateKnownState: Mock;
        has: Mock;
        clear: Mock;
        completeWindow: Mock;
        size: number;
        hasItems: boolean;
    };
    let mockTabs: any;
    let mockWindows: any;
    let mockTabGroups: any;
    let mockAlarms: any;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        // Setup Chrome mocks
        mockTabs = {
            query: vi.fn(),
            get: vi.fn(),
            remove: vi.fn(),
            onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
            onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
            onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
            TAB_ID_NONE: -1,
            TabStatus: { LOADING: 'loading', COMPLETE: 'complete' },
            WindowType: { NORMAL: 'normal' }
        };
        mockAlarms = {
            create: vi.fn(),
            get: vi.fn(),
        };
        mockWindows = {
            get: vi.fn(),
            getAll: vi.fn(),
            WindowType: { NORMAL: 'normal' }
        };
        mockTabGroups = {
            query: vi.fn(),
            onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
            onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
            onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
        };

        // Use direct assignment instead of stubGlobal to ensure visibility
        Object.assign(global, {
            chrome: {
                tabs: mockTabs,
                alarms: mockAlarms,
                windows: mockWindows,
                tabGroups: mockTabGroups,
            }
        });

        mockProcessingState = {
            enqueue: vi.fn(),
            updateKnownState: vi.fn(),
            has: vi.fn(),
            clear: vi.fn(),
            completeWindow: vi.fn().mockResolvedValue(undefined),
            size: 0,
            hasItems: false
        };
        const mockQueueProcessor = {
            process: vi.fn().mockResolvedValue(undefined)
        };
        tabManager = new TabManager(mockProcessingState as unknown as ProcessingState, mockQueueProcessor as unknown as QueueProcessor);

        // Default mocks
        // Capture referenced mocks for tests to use


        vi.mocked(mockTabs.query).mockResolvedValue([]);
        vi.mocked(StateService.getSuggestionCache).mockResolvedValue(new Map());
        vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(undefined);
        vi.mocked(StateService.updateWindowSnapshot).mockResolvedValue(undefined);
        vi.mocked(StateService.updateDuplicateCount).mockResolvedValue(undefined);
        vi.mocked(SettingsStorage.get).mockResolvedValue({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            }
        } as AppSettings);
        vi.mocked(mockTabGroups.query).mockResolvedValue([]);
        vi.mocked(WindowSnapshot.fetch).mockResolvedValue(new MockWindowSnapshot([], []) as unknown as WindowSnapshot);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handleTabUpdated', () => {
        it('should remove suggestion if URL changed', async () => {
            await tabManager.handleTabUpdated(101, { url: 'http://new.com' });
            expect(StateService.removeSuggestion).toHaveBeenCalledWith(101);
        });

        it('should remove suggestion if groupId changed', async () => {
            await tabManager.handleTabUpdated(102, { groupId: 123 });
            expect(StateService.removeSuggestion).toHaveBeenCalledWith(102);
        });

        it('should trigger recalculation if moved to TAB_ID_NONE', async () => {
            const spyTrigger = vi.spyOn(tabManager, 'triggerRecalculation');

            await tabManager.handleTabUpdated(103, { groupId: mockTabs.TAB_ID_NONE });

            expect(StateService.removeSuggestion).toHaveBeenCalledWith(103);
            expect(spyTrigger).toHaveBeenCalled();
        });

        it('should NOT trigger recalculation if moved to a group', async () => {
            const spyTrigger = vi.spyOn(tabManager, 'triggerRecalculation');

            await tabManager.handleTabUpdated(104, { groupId: 555 });

            expect(StateService.removeSuggestion).toHaveBeenCalledWith(104);
            expect(spyTrigger).not.toHaveBeenCalled();
        });

        it('should trigger recalculation if status is complete', async () => {
            const spyTrigger = vi.spyOn(tabManager, 'triggerRecalculation');

            await tabManager.handleTabUpdated(105, { status: 'complete' });

            expect(spyTrigger).toHaveBeenCalled();
        });

        describe('Autopilot Duplicate Cleaning', () => {
            beforeEach(() => {
                vi.mocked(SettingsStorage.get).mockResolvedValue({
                    features: {
                        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
                    }
                } as AppSettings);
            });

            it('should NOT check duplicates if autopilot is OFF', async () => {
                await tabManager.handleTabUpdated(101, { status: 'complete' });
                expect(mockTabs.get).not.toHaveBeenCalled();
            });

            it('should check and remove duplicates if autopilot is ON', async () => {
                // Mock DuplicateCloser.isAutopilotEnabled to return true
                // Note: We need to access the mocked module from import
                // But duplicate module is mocked in factory.
                // Mock DuplicateCloser.isAutopilotEnabled to return true
                vi.mocked(DuplicateCloser.isAutopilotEnabled).mockResolvedValue(true);

                vi.mocked(SettingsStorage.get).mockResolvedValue({
                    features: {
                        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: true }
                    }
                } as AppSettings);

                const updatedTabId = 101;
                const duplicateTabId = 102;
                vi.mocked(mockTabs.get).mockResolvedValue({ id: updatedTabId, windowId: 1 } as chrome.tabs.Tab);

                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true },
                    { id: duplicateTabId, url: 'http://a.com', windowId: 1, active: false }
                ] as chrome.tabs.Tab[];
                vi.mocked(mockTabs.query).mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.get).toHaveBeenCalledWith(updatedTabId);
                expect(mockTabs.get).toHaveBeenCalledWith(updatedTabId);
                expect(DuplicateCloser.closeDuplicatesInWindow).toHaveBeenCalledWith(1);
            });

            it('should NOT remove updated tab if it is the one to keep', async () => {
                vi.mocked(SettingsStorage.get).mockResolvedValue({
                    features: {
                        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: true }
                    }
                } as AppSettings);
                const updatedTabId = 101;
                vi.mocked(mockTabs.get).mockResolvedValue({ id: updatedTabId, windowId: 1 } as chrome.tabs.Tab);

                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true }
                ] as chrome.tabs.Tab[];
                vi.mocked(mockTabs.query).mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.remove).not.toHaveBeenCalled();
            });
        });
    });

    describe('triggerRecalculation', () => {
        it('should debounce multiple rapid calls', async () => {
            // Mock fetchAll to return map
            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([[1, new MockWindowSnapshot([], []) as unknown as WindowSnapshot]]));

            // Call multiple times rapidly
            tabManager.triggerRecalculation('Test Call 1');
            tabManager.triggerRecalculation('Test Call 2');
            tabManager.triggerRecalculation('Test Call 3');

            // Before debounce timer fires, no processing should have occurred
            expect(WindowSnapshot.fetchAll).not.toHaveBeenCalled();

            // Advance past debounce delay (1500ms)
            await vi.advanceTimersByTimeAsync(1600);

            // Should only have queried once despite 3 calls
            expect(WindowSnapshot.fetchAll).toHaveBeenCalledTimes(1);
        });

        it('should add windowId to processing state after debounce IF tab count > 0', async () => {
            // Mock non-empty snapshot
            const validTab = { id: 1, url: 'http://a.com', title: 'A', status: 'complete', groupId: -1, windowId: 1 } as chrome.tabs.Tab;
            const snapshot = new MockWindowSnapshot([validTab], []) as unknown as WindowSnapshot;
            Object.defineProperty(snapshot, 'tabCount', { get: () => 1 });

            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([[1, snapshot]]));

            tabManager.triggerRecalculation('Test Debounce');
            await vi.advanceTimersByTimeAsync(1600);

            expect(WindowSnapshot.fetchAll).toHaveBeenCalledWith({ windowTypes: ['normal'] });
            expect(mockProcessingState.enqueue).toHaveBeenCalledWith(1, snapshot, false);
        });

        it('should NOT add windowId if tab count == 0 (fixed behavior)', async () => {
            // Mock EMPTY snapshot
            const snapshot = new MockWindowSnapshot([], []) as unknown as WindowSnapshot;
            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([[1, snapshot]]));

            // Ensure verifySnapshot returns false (changed) so we trigger logic
            vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(undefined);

            tabManager.triggerRecalculation('Test Empty');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.enqueue).not.toHaveBeenCalled();
            expect(mockProcessingState.updateKnownState).toHaveBeenCalledWith(1, snapshot);
        });

        it('should process window if mismatch and tab count > 0', async () => {
            const validTab = { id: 1, url: 'http://a.com', title: 'A', status: 'complete', groupId: -1, windowId: 1 } as chrome.tabs.Tab;
            const snapshot = new MockWindowSnapshot([validTab], []) as unknown as WindowSnapshot;
            Object.defineProperty(snapshot, 'tabCount', { get: () => 1 });

            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([[1, snapshot]]));
            vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(undefined); // Mismatch

            tabManager.triggerRecalculation('Test Mixed');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.enqueue).toHaveBeenCalledWith(1, snapshot, false);
        });

        it('should NOT process window if state matches (no change)', async () => {
            const validTab = { id: 1, url: 'http://a.com', title: 'A', status: 'complete', groupId: -1, windowId: 1 } as chrome.tabs.Tab;
            const snapshot = new MockWindowSnapshot([validTab], []) as unknown as WindowSnapshot;
            Object.defineProperty(snapshot, 'tabCount', { get: () => 1 });
            // Mock equals to return TRUE
            snapshot.equals = vi.fn().mockReturnValue(true);

            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([[1, snapshot]]));
            vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(snapshot.fingerprint); // Matches!

            tabManager.triggerRecalculation('Test No Change');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.enqueue).not.toHaveBeenCalled();
            expect(mockProcessingState.updateKnownState).not.toHaveBeenCalled();
        });

        it('should process multiple windows', async () => {
            const validTab1 = { id: 1, url: 'http://a.com', title: 'A', status: 'complete', groupId: -1, windowId: 1 } as chrome.tabs.Tab;
            const validTab2 = { id: 2, url: 'http://b.com', title: 'B', status: 'complete', groupId: -1, windowId: 2 } as chrome.tabs.Tab;
            const snapshot1 = new MockWindowSnapshot([validTab1], []) as unknown as WindowSnapshot;
            const snapshot2 = new MockWindowSnapshot([validTab2], []) as unknown as WindowSnapshot;
            Object.defineProperty(snapshot1, 'tabCount', { get: () => 1 });
            Object.defineProperty(snapshot2, 'tabCount', { get: () => 1 });

            vi.mocked(WindowSnapshot.fetchAll).mockResolvedValue(new Map([
                [1, snapshot1],
                [2, snapshot2]
            ]));
            vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(undefined);

            tabManager.triggerRecalculation('Test Multiple Windows');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.enqueue).toHaveBeenCalledWith(1, snapshot1, false);
            expect(mockProcessingState.enqueue).toHaveBeenCalledWith(2, snapshot2, false);
        });
    });
});
