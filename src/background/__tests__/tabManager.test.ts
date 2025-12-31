
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabManager } from '../tabManager';
import { StateService } from '../state';

import { SettingsStorage } from '../../utils/storage';

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
};

global.chrome = {
    tabs: mockTabs,
    alarms: mockAlarms,
} as any;

describe('TabManager', () => {
    let tabManager: TabManager;
    let mockProcessingState: any;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockProcessingState = {
            add: vi.fn(),
            has: vi.fn(),
            clear: vi.fn(),
            size: 0
        };
        const mockQueueProcessor = {
            process: vi.fn().mockResolvedValue(undefined)
        };
        tabManager = new TabManager(mockProcessingState, mockQueueProcessor as any);

        // Default mocks
        mockTabs.query.mockResolvedValue([]);
        (StateService.getSuggestionCache as any).mockResolvedValue(new Map());
        (SettingsStorage.get as any).mockResolvedValue({ autopilot: false });
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
                (SettingsStorage.get as any).mockResolvedValue({ autopilot: {} });
            });

            it('should NOT check duplicates if autopilot is OFF', async () => {
                await tabManager.handleTabUpdated(101, { status: 'complete' });
                expect(mockTabs.get).not.toHaveBeenCalled();
            });

            it('should check and remove duplicates if autopilot is ON', async () => {
                (SettingsStorage.get as any).mockResolvedValue({ autopilot: { 'duplicate-cleaner': true } });

                const updatedTabId = 101;
                const duplicateTabId = 102;
                mockTabs.get.mockResolvedValue({ id: updatedTabId, windowId: 1 });

                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true },
                    { id: duplicateTabId, url: 'http://a.com', windowId: 1, active: false }
                ];
                mockTabs.query.mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.get).toHaveBeenCalledWith(updatedTabId);
                expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 1 });
                expect(mockTabs.remove).toHaveBeenCalledWith([duplicateTabId]);
            });

            it('should NOT remove updated tab if it is the one to keep', async () => {
                (SettingsStorage.get as any).mockResolvedValue({ autopilot: { 'duplicate-cleaner': true } });
                const updatedTabId = 101;
                mockTabs.get.mockResolvedValue({ id: updatedTabId, windowId: 1 });

                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true }
                ];
                mockTabs.query.mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.remove).not.toHaveBeenCalled();
            });
        });
    });

    describe('triggerRecalculation', () => {
        it('should debounce multiple rapid calls', async () => {
            const mockTab = { id: 200, groupId: -1, url: 'url', title: 'title', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);

            // Call multiple times rapidly
            tabManager.triggerRecalculation('Test Call 1');
            tabManager.triggerRecalculation('Test Call 2');
            tabManager.triggerRecalculation('Test Call 3');

            // Before debounce timer fires, no processing should have occurred
            expect(mockTabs.query).not.toHaveBeenCalled();

            // Advance past debounce delay (1500ms)
            await vi.advanceTimersByTimeAsync(1600);

            // Should only have queried once despite 3 calls
            expect(mockTabs.query).toHaveBeenCalledTimes(1);
        });

        it('should add tabs to processing state after debounce', async () => {
            const mockTab = { id: 200, groupId: -1, url: 'url', title: 'title', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);

            tabManager.triggerRecalculation('Test Debounce');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockTabs.query).toHaveBeenCalledWith({ windowType: 'normal' });
            expect(mockProcessingState.add).toHaveBeenCalledWith(200);
        });

        it('should filter out already grouped tabs', async () => {
            const mockTab = { id: 201, groupId: 999, url: 'url', title: 'title', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);

            tabManager.triggerRecalculation('Test Call Filter');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).not.toHaveBeenCalled();
        });

        it('should filter out empty new tabs', async () => {
            const newTabUrls = [
                'chrome://newtab/',
                'chrome://new-tab-page/',
                'about:blank',
                'edge://newtab/'
            ];

            for (const url of newTabUrls) {
                vi.clearAllMocks();
                (StateService.getSuggestionCache as any).mockResolvedValue(new Map());

                const mockTab = { id: 300, groupId: -1, url, title: 'New tab', status: 'complete' };
                mockTabs.query.mockResolvedValue([mockTab]);

                tabManager.triggerRecalculation('Test New Tab');
                await vi.advanceTimersByTimeAsync(1600);

                expect(mockProcessingState.add).not.toHaveBeenCalled();
            }
        });

        it('should process normal tabs but not empty new tabs in same query', async () => {
            const tabs = [
                { id: 400, groupId: -1, url: 'https://example.com', title: 'Example', status: 'complete' },
                { id: 401, groupId: -1, url: 'chrome://newtab/', title: 'New tab', status: 'complete' }
            ];
            mockTabs.query.mockResolvedValue(tabs);

            tabManager.triggerRecalculation('Test Mixed');
            await vi.advanceTimersByTimeAsync(1600);

            expect(mockProcessingState.add).toHaveBeenCalledWith(400);
            expect(mockProcessingState.add).not.toHaveBeenCalledWith(401);
        });

        it('should re-queue cached tabs', async () => {
            const mockTab = { id: 501, groupId: -1, url: 'https://example.com', title: 'Example', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);
            // Tab is already in cache
            (StateService.getSuggestionCache as any).mockResolvedValue(new Map([[501, { tabId: 501 }]]));

            tabManager.triggerRecalculation('Test Cached');
            await vi.advanceTimersByTimeAsync(1600);

            // Should still add to processing state because we want to re-process everything
            expect(mockProcessingState.add).toHaveBeenCalledWith(501);
        });
    });
});
