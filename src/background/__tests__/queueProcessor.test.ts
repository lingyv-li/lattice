
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueProcessor } from '../queueProcessor';
import { ProcessingState } from '../processing';
import { StateService } from '../state';
import { generateTabGroupSuggestions } from '../../utils/ai';
import { getSettings } from '../../utils/storage';
import { applyTabGroup } from '../../utils/tabs';

// Mock dependencies
vi.mock('../processing');
vi.mock('../state');
vi.mock('../../utils/ai');
vi.mock('../../utils/storage');
vi.mock('../../utils/tabs');

// Mock global objects
const mockLanguageModel = {
    availability: vi.fn(),
    create: vi.fn(),
};
global.self = {
    LanguageModel: mockLanguageModel
} as any;

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
        mockLanguageModel.availability.mockResolvedValue('readily');
        mockSettings({ autopilot: false });
        mockState.startProcessing.mockReturnValue([101, 102]);
        mockTabs.get.mockImplementation((id) => Promise.resolve({ id, windowId: 1, url: 'http://example.com', title: 'Example' }));
        mockWindows.get.mockResolvedValue({ id: 1, type: 'normal' });
        mockTabGroups.query.mockResolvedValue([]);
        mockStateServiceCache(new Map());

        // Mock AI to return a group
        (generateTabGroupSuggestions as any).mockResolvedValue([
            { groupName: 'AI Group', tabIds: [101, 102], existingGroupId: null }
        ]);
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
        expect(generateTabGroupSuggestions).toHaveBeenCalled();

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
        expect(generateTabGroupSuggestions).toHaveBeenCalled();

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
        expect(generateTabGroupSuggestions).not.toHaveBeenCalled();
    });

    it('should skip non-normal windows', async () => {
        mockWindows.get.mockResolvedValue({ id: 1, type: 'popup' });
        await processor.process();
        expect(generateTabGroupSuggestions).not.toHaveBeenCalled();
    });

    it('should not process if AI is unavailable', async () => {
        mockLanguageModel.availability.mockResolvedValue('unavailable');
        await processor.process();
        expect(mockState.startProcessing).not.toHaveBeenCalled();
    });
});
