
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { TabManager } from '../tabManager';
import { StateService } from '../state';
import { ProcessingState } from '../processing';
import { QueueProcessor } from '../queueProcessor';
import { SettingsStorage, AppSettings } from '../../utils/storage';
import { FeatureId } from '../../types/features';

// Mock dependencies
vi.mock('../state');
vi.mock('../processing');
vi.mock('../../utils/storage');

// Mock chrome API
const mockTabs = {
    query: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    TAB_ID_NONE: -1,
    TabStatus: { LOADING: 'loading', COMPLETE: 'complete' }, // Mock Enum
    WindowType: { NORMAL: 'normal' }
};
const mockAlarms = {
    create: vi.fn(),
    get: vi.fn(),
};
const mockWindows = {
    get: vi.fn(),
    getAll: vi.fn(),
    WindowType: { NORMAL: 'normal' }
};
const mockTabGroups = {
    query: vi.fn(),
};

global.chrome = {
    tabs: mockTabs,
    alarms: mockAlarms,
    windows: mockWindows,
    tabGroups: mockTabGroups,
} as unknown as typeof chrome;

describe('TabManager', () => {
    let tabManager: TabManager;
    let mockProcessingState: {
        add: Mock;
        has: Mock;
        clear: Mock;
        isWindowChanged: Mock;
        completeWindow: Mock;
        size: number;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockProcessingState = {
            add: vi.fn(),
            has: vi.fn(),
            clear: vi.fn(),
            isWindowChanged: vi.fn().mockResolvedValue(true),
            completeWindow: vi.fn().mockResolvedValue(undefined),
            size: 0
        };
        const mockQueueProcessor = {
            process: vi.fn().mockResolvedValue(undefined)
        };
        tabManager = new TabManager(mockProcessingState as unknown as ProcessingState, mockQueueProcessor as unknown as QueueProcessor);

        // Default mocks
        vi.mocked(mockTabs.query).mockResolvedValue([]);
        vi.mocked(StateService.getSuggestionCache).mockResolvedValue(new Map());
        vi.mocked(StateService.getWindowSnapshot).mockResolvedValue(undefined);
        vi.mocked(StateService.updateWindowSnapshot).mockResolvedValue(undefined);
        vi.mocked(SettingsStorage.get).mockResolvedValue({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            }
        } as AppSettings);
        vi.mocked(mockTabGroups.query).mockResolvedValue([]);
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
                expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 1 });
                expect(mockTabs.remove).toHaveBeenCalledWith([duplicateTabId]);
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
            // Mock windows.getAll to return a window
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);

            // Call multiple times rapidly
            tabManager.triggerRecalculation('Test Call 1');
            tabManager.triggerRecalculation('Test Call 2');
            tabManager.triggerRecalculation('Test Call 3');

            // Before debounce timer fires, no processing should have occurred
            expect(mockWindows.getAll).not.toHaveBeenCalled();

            // Advance past debounce delay (1500ms)
            await vi.advanceTimersByTimeAsync(1600);

            // Should only have queried once despite 3 calls
            expect(mockWindows.getAll).toHaveBeenCalledTimes(1);
        });

        it('should add windowId to processing state after debounce', async () => {
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);

            tabManager.triggerRecalculation('Test Debounce');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockWindows.getAll).toHaveBeenCalledWith({ windowTypes: ['normal'] });
            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
        });

        it('should filter out already grouped tabs', async () => {
            // No windows, so nothing to process
            vi.mocked(mockWindows.getAll).mockResolvedValue([]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(false);

            tabManager.triggerRecalculation('Test Call Filter');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).not.toHaveBeenCalled();
        });

        it('should trigger windows for empty new tabs (filter happens in processor)', async () => {
            // Window exists, isWindowChanged returns true
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(true);

            tabManager.triggerRecalculation('Test New Tab');
            await vi.advanceTimersByTimeAsync(1600);

            // TabManager now just calls add() and lets processor handle filtering
            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
        });

        it('should process window if any ungrouped tabs exist', async () => {
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(true);

            tabManager.triggerRecalculation('Test Mixed');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
        });

        it('should trigger windows for cached tabs', async () => {
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(true);

            tabManager.triggerRecalculation('Test Cached');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
        });

        it('should process window once even with multiple tabs', async () => {
            vi.mocked(mockWindows.getAll).mockResolvedValue([{ id: 1, type: 'normal' }] as chrome.windows.Window[]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(true);

            tabManager.triggerRecalculation('Test Multiple');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).toHaveBeenCalledTimes(1);
            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
        });

        it('should process multiple windows', async () => {
            vi.mocked(mockWindows.getAll).mockResolvedValue([
                { id: 1, type: 'normal' },
                { id: 2, type: 'normal' }
            ] as chrome.windows.Window[]);
            vi.mocked(mockProcessingState.isWindowChanged).mockResolvedValue(true);

            tabManager.triggerRecalculation('Test Multiple Windows');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).toHaveBeenCalledWith(1, false);
            expect(mockProcessingState.add).toHaveBeenCalledWith(2, false);
        });
    });
});
