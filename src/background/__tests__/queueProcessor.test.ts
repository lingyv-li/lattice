import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from '../queueProcessor';
import { StateService } from '../state';
import { AIService } from '../../services/ai/AIService';
import { SettingsStorage } from '../../utils/storage';
import { applyTabGroup } from '../../utils/tabs';
import { FeatureId } from '../../types/features';

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
            hasItems: true,
            isStale: false,
            acquireQueue: vi.fn(),
            release: vi.fn(),
        };
        // Mock hasItems getter
        Object.defineProperty(mockState, 'hasItems', {
            get: vi.fn()
                .mockReturnValueOnce(true) // First check: Logging
                .mockReturnValueOnce(true) // Second check: Loop condition
                .mockReturnValue(false)    // Subsequent checks: false
        });

        processor = new QueueProcessor(mockState);

        // Default happy path mocks
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            }
        });
        mockState.acquireQueue.mockReturnValue([101, 102]);
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
        (SettingsStorage.get as any).mockResolvedValue(settings);
    };

    const mockStateServiceCache = (cache: Map<any, any>) => {
        (StateService.getSuggestionCache as any).mockResolvedValue(cache);
    };

    it('should cache suggestions when autopilot is OFF', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false }
            }
        });

        await processor.process();

        // AI called
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).toHaveBeenCalled();

        // Should NOT apply group
        expect(applyTabGroup).not.toHaveBeenCalled();

        // Should cache suggestion
        expect(StateService.updateSuggestions).toHaveBeenCalledTimes(1);
        expect(StateService.updateSuggestions).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ tabId: 101, groupName: 'AI Group' }),
            expect.objectContaining({ tabId: 102, groupName: 'AI Group' })
        ]));

        // Should release lock
        expect(mockState.release).toHaveBeenCalled();
    });

    it('should apply groups immediately when autopilot is ON', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: true }
            }
        });

        await processor.process();

        // AI called
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).toHaveBeenCalled();

        // Should apply group
        expect(applyTabGroup).toHaveBeenCalledWith([101, 102], 'AI Group', null, 1);

        // Should NOT cache suggestion (except maybe negative results? logic says only skipped if applied)
        expect(StateService.updateSuggestions).not.toHaveBeenCalled();

        expect(mockState.release).toHaveBeenCalled();
    });

    it('should handle window closed error gracefully', async () => {
        mockWindows.get.mockRejectedValue(new Error("Window closed"));
        await processor.process();
        expect(AIService.getProvider).not.toHaveBeenCalled();
        expect(mockState.release).toHaveBeenCalled();
    });

    it('should skip non-normal windows', async () => {
        mockWindows.get.mockResolvedValue({ id: 1, type: 'popup' });
        await processor.process();
        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).not.toHaveBeenCalled();
        expect(mockState.release).toHaveBeenCalled();
    });

    it('should clear queue and release if Tab Grouper is disabled', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: false, autopilot: false }
            }
        });

        await processor.process();

        // AI should NOT be called
        expect(AIService.getProvider).not.toHaveBeenCalled();

        // Should release lock
        expect(mockState.release).toHaveBeenCalled();
    });

    describe('staleness detection', () => {
        it('should release lock if tabs become stale', async () => {
            mockSettings({
                features: {
                    [FeatureId.TabGrouper]: { enabled: true, autopilot: false }
                }
            });

            // Tab changes URL during processing
            let callCount = 0;
            mockTabs.get.mockImplementation((id) => {
                callCount++;
                if (id === 102 && callCount > 2) {
                    // Simulating what happens in reality: TabManager detects change and marks state as stale
                    mockState.isStale = true;
                    return Promise.resolve({ id, windowId: 1, url: 'http://changed.com', title: 'Changed' });
                }
                return Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' });
            });

            await processor.process();

            // finish() is removed, but we should verify it completes without applying/caching
            expect(mockState.release).toHaveBeenCalled();
            // Staleness means NO updates applied
            expect(StateService.updateSuggestions).not.toHaveBeenCalled();
        });

        it('should skip tabs that moved to a different window during processing', async () => {
            mockSettings({
                features: {
                    [FeatureId.TabGrouper]: { enabled: true, autopilot: true }
                }
            });

            // Tab 102 moves to window 2 (e.g. popup) during processing
            let callCount = 0;
            mockTabs.get.mockImplementation((id) => {
                callCount++;
                if (id === 102 && callCount > 2) {
                    // Moves to window 2
                    return Promise.resolve({ id, windowId: 2, url: 'http://example.com', title: 'Example' });
                }
                return Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' });
            });

            await processor.process();

            // Should NOT apply group for tab 102 because it moved
            // Tab 101 is still valid
            expect(applyTabGroup).toHaveBeenCalledWith([101], 'AI Group', null, 1);
            expect(applyTabGroup).not.toHaveBeenCalledWith(expect.arrayContaining([102]), expect.any(String), expect.any(Object));
            expect(mockState.release).toHaveBeenCalled();
        });

        it('should abort entire process if state is marked stale at batch start', async () => {
            mockState.isStale = true;
            await processor.process();

            const provider = await AIService.getProvider({} as any);
            expect(provider.generateSuggestions).not.toHaveBeenCalled();
            expect(mockState.release).toHaveBeenCalled();
        });

        it('should discard batch results if state becomes stale during AI call', async () => {
            // Mock state becoming stale during AI call
            const mockProvider = await AIService.getProvider({} as any) as any;
            mockProvider.generateSuggestions.mockImplementation(async () => {
                mockState.isStale = true;
                return { suggestions: [], errors: [] };
            });

            await processor.process();

            expect(StateService.updateSuggestions).not.toHaveBeenCalled();
            expect(mockState.release).toHaveBeenCalled();
        });
    });
});

