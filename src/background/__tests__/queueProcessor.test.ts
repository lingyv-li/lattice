import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from '../queueProcessor';
import { StateService } from '../state';
import { AIService } from '../../services/ai/AIService';
import { getSettings } from '../../utils/storage';
import { applyTabGroup } from '../../utils/tabs';

// Mock dependencies
vi.mock('../processing');
vi.mock('../state');
vi.mock('../../services/ai/AIService');
vi.mock('../../services/ai/shared', () => ({
    mapExistingGroups: vi.fn(),
}));
vi.mock('../../utils/storage');
vi.mock('../../utils/tabs');

// Mock global objects
const mockTabs = {
    get: vi.fn(),
    group: vi.fn(),
};
const mockWindows = {
    get: vi.fn(),
    WindowType: { NORMAL: 'normal' },
};
const mockTabGroups = {
    query: vi.fn(),
    update: vi.fn(),
};

global.chrome = {
    tabs: mockTabs,
    windows: mockWindows,
    tabGroups: mockTabGroups,
} as any;

describe('QueueProcessor', () => {
    let processor: QueueProcessor;
    let mockState: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockState = {
            size: 1,
            startProcessing: vi.fn(),
            finish: vi.fn(),
        };
        processor = new QueueProcessor(mockState);

        // Default happy path mocks
        mockSettings({ autopilot: false });
        mockState.startProcessing.mockReturnValue([101, 102]);
        mockTabs.get.mockImplementation((id) => Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' }));
        mockWindows.get.mockResolvedValue({ id: 1, type: 'normal' });
        mockTabGroups.query.mockResolvedValue([]);
        mockStateServiceCache(new Map());

        // Mock AI Service with Provider
        const mockProvider = {
            id: 'mock',
            generateSuggestions: vi.fn().mockResolvedValue({
                suggestions: [
                    { groupName: 'AI Group', tabIds: [101, 102], existingGroupId: null }
                ],
                errors: []
            })
        };
        (AIService.getProvider as any).mockResolvedValue(mockProvider);
    });

    const mockSettings = (settings: any) => {
        (getSettings as any).mockResolvedValue(settings);
    };

    const mockStateServiceCache = (cache: Map<any, any>) => {
        (StateService.getSuggestionCache as any).mockResolvedValue(cache);
    };

    it('should cache suggestions when autopilot is OFF', async () => {
        mockSettings({ autopilot: false });

        await processor.process();

        // AI called
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).toHaveBeenCalled();

        // Should NOT apply group
        expect(applyTabGroup).not.toHaveBeenCalled();

        // Should cache suggestion
        expect(StateService.updateSuggestion).toHaveBeenCalledTimes(2); // One for each tab
        expect(StateService.updateSuggestion).toHaveBeenCalledWith(expect.objectContaining({
            tabId: 101,
            groupName: 'AI Group'
        }));
    });

    it('should apply groups immediately when autopilot is ON', async () => {
        mockSettings({ autopilot: true });

        await processor.process();

        // AI called
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).toHaveBeenCalled();

        // Should apply group
        expect(applyTabGroup).toHaveBeenCalledWith([101, 102], 'AI Group', null);

        // Should NOT cache suggestion (except maybe negative results? logic says only skipped if applied)
        // In the code: if autopilot -> apply -> skip cache loop
        // So updateSuggestion should NOT be called for these tabs
        expect(StateService.updateSuggestion).not.toHaveBeenCalled();
    });

    it('should handle window closed error gracefully', async () => {
        mockWindows.get.mockRejectedValue(new Error("Window closed"));
        await processor.process();
        expect(AIService.getProvider).not.toHaveBeenCalled();
    });

    it('should skip non-normal windows', async () => {
        mockWindows.get.mockResolvedValue({ id: 1, type: 'popup' });
        await processor.process();
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).not.toHaveBeenCalled();
    });

    describe('staleness detection', () => {
        it('should call finish() for tabs that become stale during processing', async () => {
            mockSettings({ autopilot: false });

            // Tab changes URL during processing
            let callCount = 0;
            mockTabs.get.mockImplementation((id) => {
                callCount++;
                if (id === 102 && callCount > 2) {
                    // On validation, tab 102 has changed URL
                    return Promise.resolve({ id, windowId: 1, url: 'http://changed.com', title: 'Changed' });
                }
                return Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' });
            });

            await processor.process();

            // finish() should be called for stale tab
            expect(mockState.finish).toHaveBeenCalledWith(102);
        });

        it('should call finish() for tabs that no longer exist', async () => {
            mockSettings({ autopilot: false });

            // Tab 102 disappears during processing
            let callCount = 0;
            mockTabs.get.mockImplementation((id) => {
                callCount++;
                if (id === 102 && callCount > 2) {
                    return Promise.reject(new Error('Tab not found'));
                }
                return Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' });
            });

            await processor.process();

            expect(mockState.finish).toHaveBeenCalledWith(102);
        });
    });
});
