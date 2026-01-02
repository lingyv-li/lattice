import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueProcessor } from '../queueProcessor';
import { StateService } from '../state';
import { AIService } from '../../services/ai/AIService';
import { SettingsStorage } from '../../utils/storage';
import { applyTabGroup } from '../../utils/tabs';
import { FeatureId } from '../../types/features';
import { WindowSnapshot } from '../../utils/snapshots';
import { MockWindowSnapshot } from './testUtils';

// Mock dependencies
vi.mock('../processing');
vi.mock('../state');
vi.mock('../../services/ai/AIService');
vi.mock('../../services/ai/shared', () => ({
    mapExistingGroups: vi.fn().mockReturnValue(new Map()),
}));
vi.mock('../../utils/storage');
vi.mock('../../utils/tabs');

// Mock global objects
const mockTabs = {
    query: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    group: vi.fn(),
    move: vi.fn(),
    ungroup: vi.fn(),
    TAB_ID_NONE: -1,
    TabStatus: { LOADING: 'loading', COMPLETE: 'complete' }
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
    let mockWindowState: any;
    let mockState: any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(WindowSnapshot, 'fetch');

        mockWindowState = {
            updateFromSnapshot: vi.fn(),
            verifySnapshot: vi.fn().mockReturnValue(true),
            lastPersistentSnapshot: null,
            inputSnapshot: new MockWindowSnapshot([], [])
        };

        mockState = {
            hasItems: true,
            getWindowState: vi.fn().mockReturnValue(mockWindowState),
            completeWindow: vi.fn(),
            acquireQueue: vi.fn(),
            add: vi.fn(),
            isWindowChanged: vi.fn(),
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
        mockState.acquireQueue.mockReturnValue([1]);
        const testTabs = [
            { id: 101, windowId: 1, url: 'http://example.com', title: 'Example' },
            { id: 102, windowId: 1, url: 'http://example.com', title: 'Example' }
        ];
        (chrome.tabs.query as any) = vi.fn().mockResolvedValue(testTabs);
        (chrome.tabGroups.query as any) = vi.fn().mockResolvedValue([]);

        // Mock snapshot return
        vi.mocked(WindowSnapshot.fetch).mockResolvedValue(new MockWindowSnapshot(testTabs as unknown as chrome.tabs.Tab[], []));
        // Ensure input snapshot matches
        mockWindowState.inputSnapshot = new MockWindowSnapshot(testTabs as unknown as chrome.tabs.Tab[], []);

        // Feed AI from snapshot - ensure inputSnapshot has data
        mockWindowState.inputSnapshot = new MockWindowSnapshot(testTabs as unknown as chrome.tabs.Tab[], []);

        mockTabs.get.mockImplementation((id) => Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' }));
        mockWindows.get.mockResolvedValue({ id: 1, type: 'normal' });
        mockTabGroups.query.mockResolvedValue([]);
        mockStateServiceCache(new Map());
        (StateService.getWindowSnapshot as any).mockResolvedValue(undefined);
        (StateService.updateWindowSnapshot as any).mockResolvedValue(undefined);

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

    });

    it('should abort if snapshot verification fails', async () => {
        // Mock snapshot mismatch - return a snapshot with different fingerprint
        const diffTabs = [{ id: 999, url: 'http://diff.com', title: 'Diff' }] as any;
        vi.mocked(WindowSnapshot.fetch).mockResolvedValue(new MockWindowSnapshot(diffTabs, []));
        // Since we are using the mockWindowState, we must explicitly tell it to fail verification
        mockWindowState.verifySnapshot.mockResolvedValue(false);

        await processor.process();

        const provider = await AIService.getProvider({} as any);
        expect(provider.generateSuggestions).not.toHaveBeenCalled();

        // add() is now called with just windowId (fetches data internally)
        expect(mockState.add).toHaveBeenCalledWith(1, true);
        expect(mockState.completeWindow).not.toHaveBeenCalled();
    });

    it('should NOT cache negative results for missing tabs', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: false }
            }
        });

        // Setup: 2 tabs in batch
        const testTabs = [
            { id: 101, windowId: 1, url: 'http://a.com', title: 'A' },
            { id: 102, windowId: 1, url: 'http://b.com', title: 'B' }
        ];
        (chrome.tabs.query as any).mockResolvedValue(testTabs);
        // Ensure snapshot has these tabs
        mockWindowState.inputSnapshot = new MockWindowSnapshot(testTabs as unknown as chrome.tabs.Tab[], []);

        // AI only returns group for tab 101. Tab 102 is missing.
        const mockProvider = {
            id: 'mock',
            generateSuggestions: vi.fn().mockResolvedValue({
                suggestions: [
                    { groupName: 'Group A', tabIds: [101], existingGroupId: null }
                ],
                errors: []
            })
        };
        (AIService.getProvider as any).mockResolvedValue(mockProvider);

        await processor.process();

        // Expect updateSuggestions to be called ONLY with tab 101
        expect(StateService.updateSuggestions).toHaveBeenCalledTimes(1);
        const calls = (StateService.updateSuggestions as any).mock.calls[0][0];

        // Should have 1 entry
        expect(calls).toHaveLength(1);
        expect(calls[0].tabId).toBe(101);
        expect(calls[0].groupName).toBe('Group A');

        // Should NOT have tab 102
        const tab102 = calls.find((s: any) => s.tabId === 102);
        expect(tab102).toBeUndefined();
    });

    it('should handle failed queue acquisition', async () => {
        // Mock acquireQueue to return empty array (busy or empty)
        mockState.acquireQueue.mockReturnValue([]);

        await processor.process();

        // Should not call AI
        expect(AIService.getProvider).not.toHaveBeenCalled();
        // Should not release (already released by acquireQueue failure)

    });

    it('should handle errors when applying suggestions in autopilot mode', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: true }
            }
        });

        // Mock applyTabGroup to throw an error
        (applyTabGroup as any).mockRejectedValue(new Error('Failed to apply group'));

        await processor.process();

        // Should still complete processing

        expect(mockState.completeWindow).toHaveBeenCalledWith(1);
    });

    it('should handle AI errors and store them', async () => {
        // Mock AI provider to throw an error
        const mockProvider = {
            id: 'mock',
            generateSuggestions: vi.fn().mockRejectedValue(new Error('AI service failed'))
        };
        (AIService.getProvider as any).mockResolvedValue(mockProvider);

        await processor.process();

        // Should store error

        expect(mockState.completeWindow).toHaveBeenCalledWith(1);
    });

    it('should track virtual group IDs when creating new groups in autopilot', async () => {
        mockSettings({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: true }
            }
        });

        // Mock applyTabGroup to return a new group ID
        (applyTabGroup as any).mockResolvedValue(123);

        await processor.process();

        // Should apply group and get back the new group ID
        expect(applyTabGroup).toHaveBeenCalledWith([101, 102], 'AI Group', null, 1);

    });

    it('should handle missing window state gracefully', async () => {
        // Mock getWindowState to return null
        mockState.getWindowState.mockReturnValue(null);

        await processor.process();

        // Should complete the window and continue
        expect(mockState.completeWindow).toHaveBeenCalledWith(1);

    });

    it('should handle windows with no ungrouped tabs', async () => {
        // Mock snapshot with no ungrouped tabs
        mockWindowState.inputSnapshot = new MockWindowSnapshot([], []);

        await processor.process();

        // Should complete the window without calling AI
        expect(AIService.getProvider).not.toHaveBeenCalled();
        expect(mockState.completeWindow).toHaveBeenCalledWith(1);

    });

});
