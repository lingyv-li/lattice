
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager } from '../tabManager';
import { StateService } from '../state';

import { getSettings } from '../../utils/storage';

// Mock dependencies
vi.mock('../state');
vi.mock('../processing');
vi.mock('../../utils/storage'); // Mock storage for getSettings

// Mock chrome API
const mockTabs = {
    query: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    TAB_ID_NONE: -1,
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
        vi.clearAllMocks();
        mockProcessingState = {
            add: vi.fn(),
            has: vi.fn(),
            clear: vi.fn(),
            size: 0
        };
        tabManager = new TabManager(mockProcessingState);

        // Default mocks
        mockTabs.query.mockResolvedValue([]);
        (StateService.getSuggestionCache as any).mockResolvedValue(new Map());
        (getSettings as any).mockResolvedValue({ autopilot: false }); // Default
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

        it('should queue ungrouped tabs if moved to TAB_ID_NONE', async () => {
            // Mock queueUngroupedTabs indirectly or spy on it?
            // Since it's a method on the same class, we can spy on it.
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');
            spyQueue.mockResolvedValue();

            await tabManager.handleTabUpdated(103, { groupId: mockTabs.TAB_ID_NONE });

            expect(StateService.removeSuggestion).toHaveBeenCalledWith(103);
            expect(spyQueue).toHaveBeenCalled();
        });

        it('should NOT queue ungrouped tabs if moved to a group', async () => {
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');

            await tabManager.handleTabUpdated(104, { groupId: 555 });

            expect(StateService.removeSuggestion).toHaveBeenCalledWith(104);
            expect(spyQueue).not.toHaveBeenCalled();
        });

        it('should queue ungrouped tabs if status is complete', async () => {
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');
            spyQueue.mockResolvedValue();

            await tabManager.handleTabUpdated(105, { status: 'complete' });

            expect(spyQueue).toHaveBeenCalled();
        });

        describe('Autopilot Duplicate Cleaning', () => {
            beforeEach(() => {
                // Default Autopilot OFF
                (getSettings as any).mockResolvedValue({ autopilot: false });
            });

            it('should NOT check duplicates if autopilot is OFF', async () => {
                await tabManager.handleTabUpdated(101, { status: 'complete' });
                expect(mockTabs.get).not.toHaveBeenCalled();
            });

            it('should check and remove duplicates if autopilot is ON', async () => {
                (getSettings as any).mockResolvedValue({ autopilot: true });

                // Mock tab setup
                const updatedTabId = 101;
                const duplicateTabId = 102;
                mockTabs.get.mockResolvedValue({ id: updatedTabId, windowId: 1 });

                // Mock window tabs with 2 duplicates
                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true }, // Keep active
                    { id: duplicateTabId, url: 'http://a.com', windowId: 1, active: false } // Remove
                ];
                mockTabs.query.mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.get).toHaveBeenCalledWith(updatedTabId);
                // query for window tabs
                expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 1 });
                // Expect removal of duplicate
                expect(mockTabs.remove).toHaveBeenCalledWith([duplicateTabId]);
            });

            it('should NOT remove updated tab if it is the one to keep', async () => {
                (getSettings as any).mockResolvedValue({ autopilot: true });
                const updatedTabId = 101;
                mockTabs.get.mockResolvedValue({ id: updatedTabId, windowId: 1 });

                // Only one tab, no duplicates
                const tabs = [
                    { id: updatedTabId, url: 'http://a.com', windowId: 1, active: true }
                ];
                mockTabs.query.mockResolvedValue(tabs);

                await tabManager.handleTabUpdated(updatedTabId, { status: 'complete' });

                expect(mockTabs.remove).not.toHaveBeenCalled();
            });
        });
    });

    describe('onGroupsChanged', () => {
        it('should NOT clear cache before re-processing', async () => {
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');
            spyQueue.mockResolvedValue();

            await tabManager.onGroupsChanged();

            expect(StateService.clearCache).not.toHaveBeenCalled();
        });

        it('should call queueUngroupedTabs with forceReprocess: true', async () => {
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');
            spyQueue.mockResolvedValue();

            await tabManager.onGroupsChanged();

            expect(spyQueue).toHaveBeenCalledWith(undefined, { forceReprocess: true });
        });

        it('should NOT clear processing state (staleness handled per-tab)', async () => {
            const spyQueue = vi.spyOn(tabManager, 'queueUngroupedTabs');
            spyQueue.mockResolvedValue();

            await tabManager.onGroupsChanged();

            expect(mockProcessingState.clear).not.toHaveBeenCalled();
        });
    });

    describe('queueUngroupedTabs', () => {
        it('should add straight to processing state and schedule alarm', async () => {
            // Setup
            const mockTab = { id: 200, groupId: -1, url: 'url', title: 'title', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);
            mockProcessingState.add.mockReturnValue(true);

            await tabManager.queueUngroupedTabs();

            expect(mockTabs.query).toHaveBeenCalledWith({ windowType: 'normal' });
            expect(mockProcessingState.add).toHaveBeenCalledWith(200);
            expect(mockAlarms.create).toHaveBeenCalled();
        });

        it('should filter out already grouped tabs', async () => {
            const mockTab = { id: 201, groupId: 999, url: 'url', title: 'title', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);

            await tabManager.queueUngroupedTabs();

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

                await tabManager.queueUngroupedTabs();

                expect(mockProcessingState.add).not.toHaveBeenCalled();
            }
        });

        it('should process normal tabs but not empty new tabs in same query', async () => {
            const tabs = [
                { id: 400, groupId: -1, url: 'https://example.com', title: 'Example', status: 'complete' },
                { id: 401, groupId: -1, url: 'chrome://newtab/', title: 'New tab', status: 'complete' }
            ];
            mockTabs.query.mockResolvedValue(tabs);
            mockProcessingState.add.mockReturnValue(true);

            await tabManager.queueUngroupedTabs();

            expect(mockProcessingState.add).toHaveBeenCalledWith(400);
            expect(mockProcessingState.add).not.toHaveBeenCalledWith(401);
        });

        it('should re-queue cached tabs when forceReprocess is true', async () => {
            const mockTab = { id: 500, groupId: -1, url: 'https://example.com', title: 'Example', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);
            // Tab is already in cache
            (StateService.getSuggestionCache as any).mockResolvedValue(new Map([[500, { tabId: 500 }]]));
            mockProcessingState.add.mockReturnValue(true);

            await tabManager.queueUngroupedTabs(undefined, { forceReprocess: true });

            expect(mockProcessingState.add).toHaveBeenCalledWith(500);
        });

        it('should NOT re-queue cached tabs when forceReprocess is false', async () => {
            const mockTab = { id: 501, groupId: -1, url: 'https://example.com', title: 'Example', status: 'complete' };
            mockTabs.query.mockResolvedValue([mockTab]);
            // Tab is already in cache
            (StateService.getSuggestionCache as any).mockResolvedValue(new Map([[501, { tabId: 501 }]]));

            await tabManager.queueUngroupedTabs();

            expect(mockProcessingState.add).not.toHaveBeenCalled();
        });
    });
});
