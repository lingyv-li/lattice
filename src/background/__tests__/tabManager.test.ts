
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
    });
});
