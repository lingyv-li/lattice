import { QueueProcessor } from '../queueProcessor';
import { ProcessingState } from '../processing';
import { SettingsStorage, AIProviderType } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import { AIService } from '../../services/ai/AIService';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../utils/storage');
vi.mock('../../utils/snapshots');
vi.mock('../../services/ai/AIService');
vi.mock('../../utils/tabs', async importOriginal => {
    const actual = await importOriginal<typeof import('../../utils/tabs')>();
    return { ...actual, applyTabGroup: vi.fn() };
});
vi.mock('../GroupIdManager');

describe('QueueProcessor Batch Sizing', () => {
    let queueProcessor: QueueProcessor;
    let mockState: ProcessingState;
    let mockProvider: any;
    let hasItemsMock: any;

    beforeEach(() => {
        vi.resetAllMocks();

        hasItemsMock = vi.fn();

        // Mock State
        mockState = {
            acquireQueue: vi.fn(),
            getWindowState: vi.fn(),
            completeWindow: vi.fn(),
            enqueue: vi.fn(),
            onWindowRequeued: null
        } as any;

        Object.defineProperty(mockState, 'hasItems', {
            get: hasItemsMock
        });

        queueProcessor = new QueueProcessor(mockState);

        // Mock Provider
        mockProvider = {
            generateSuggestions: vi.fn().mockResolvedValue({ suggestions: [], errors: [] })
        };
        (AIService.getProvider as any).mockResolvedValue(mockProvider);

        // Mock global chrome
        global.chrome = {
            windows: {
                get: vi.fn().mockResolvedValue({ type: 'normal' }),
                WindowType: { NORMAL: 'normal' }
            },
            tabs: {}
        } as any;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should use batch size 200 for Gemini provider', async () => {
        // Setup Settings for Gemini
        (SettingsStorage.get as any).mockResolvedValue({
            aiProvider: AIProviderType.Gemini,
            features: { [FeatureId.TabGrouper]: { enabled: true } },
            customGroupingRules: ''
        });

        // Setup Queue
        (mockState.acquireQueue as any).mockReturnValueOnce([1]).mockReturnValue([]); // Return window 1 then empty
        hasItemsMock.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false); // Log -> Loop -> items -> ...

        // Setup Window Snapshot
        const mockSnapshot = {
            getBatches: vi.fn().mockReturnValue([]), // We just want to check the call argument
            verifySnapshot: vi.fn().mockResolvedValue(true),
            isFatalChange: vi.fn().mockReturnValue(false),
            equals: vi.fn().mockReturnValue(true)
        };
        (mockState.getWindowState as any).mockReturnValue({
            inputSnapshot: mockSnapshot,
            verifySnapshot: vi.fn().mockResolvedValue(true)
        });

        await queueProcessor.process();

        // Verify getBatches was called with 200
        expect(mockSnapshot.getBatches).toHaveBeenCalledWith(200);
    });

    it('should use batch size 10 for Local provider', async () => {
        // Setup Settings for Local
        (SettingsStorage.get as any).mockResolvedValue({
            aiProvider: AIProviderType.Local,
            features: { [FeatureId.TabGrouper]: { enabled: true } },
            customGroupingRules: ''
        });

        // Setup Queue
        (mockState.acquireQueue as any).mockReturnValueOnce([1]).mockReturnValue([]);
        hasItemsMock.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);

        // Setup Window Snapshot
        const mockSnapshot = {
            getBatches: vi.fn().mockReturnValue([]),
            verifySnapshot: vi.fn().mockResolvedValue(true),
            isFatalChange: vi.fn().mockReturnValue(false),
            equals: vi.fn().mockReturnValue(true)
        };
        (mockState.getWindowState as any).mockReturnValue({
            inputSnapshot: mockSnapshot,
            verifySnapshot: vi.fn().mockResolvedValue(true)
        });

        await queueProcessor.process();

        // Verify getBatches was called with 10
        expect(mockSnapshot.getBatches).toHaveBeenCalledWith(10);
    });
});
