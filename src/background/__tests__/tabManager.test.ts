
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabManager } from '../tabManager';
import { StateService } from '../state';

// Mock dependencies
vi.mock('../state');
vi.mock('../processing');

// Mock chrome API
const mockTabs = {
    query: vi.fn(),
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
