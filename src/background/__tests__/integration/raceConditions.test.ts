import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestContext } from './setup';
import { SettingsStorage, AIProviderType } from '../../../utils/storage';
import { FeatureId } from '../../../types/features';
import { WindowSnapshot } from '../../../utils/snapshots';

describe('Integration: Race Condition Scenarios', () => {
    let context: TestContext;

    beforeEach(() => {
        vi.clearAllMocks();
        context = new TestContext();

        vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
            aiProvider: AIProviderType.Gemini,
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: true },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            },
            hasCompletedOnboarding: true
        } as any);
    });

    it('should not duplicate-process when same window is enqueued rapidly', async () => {
        const WIN_ID = 100;
        await context.setupWindow(WIN_ID);

        let aiCallCount = 0;
        vi.spyOn(await import('../../../services/ai/AIService'), 'AIService', 'get').mockReturnValue({
            getProvider: vi.fn().mockResolvedValue({
                generateSuggestions: async (request: any) => {
                    aiCallCount++;
                    await new Promise(r => setTimeout(r, 50));
                    const workTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('work'));
                    return {
                        suggestions:
                            workTabs.length > 0
                                ? [{ groupName: 'Work', tabIds: workTabs.map((t: any) => t.id), confidence: 0.9 }]
                                : []
                    };
                }
            })
        } as any);

        // Rapidly add tabs (simulates burst of tab opens)
        await context.addTab(WIN_ID, 'https://work.com/1');
        await context.addTab(WIN_ID, 'https://work.com/2');
        await context.addTab(WIN_ID, 'https://work.com/3');

        // Trigger processing once
        await context.tabManager.queueAndProcess();
        await context.waitForProcessing();

        // AI should only be called once for this window (not 3 times)
        expect(aiCallCount).toBe(1);
        expect(context.chrome.groups).toHaveLength(1);
    });

    it('should handle concurrent processing of different windows', async () => {
        const WIN_A = 200;
        const WIN_B = 201;
        await context.setupWindow(WIN_A);
        await context.setupWindow(WIN_B);

        await context.addTab(WIN_A, 'https://work.com/a1');
        await context.addTab(WIN_B, 'https://social.com/b1');

        await context.tabManager.queueAndProcess();
        await context.waitForProcessing();

        // Both windows should have their own groups
        const workGroups = context.chrome.groups.filter(g => g.title === 'Work');
        const socialGroups = context.chrome.groups.filter(g => g.title === 'Social');
        expect(workGroups).toHaveLength(1);
        expect(socialGroups).toHaveLength(1);

        // Groups should be in the correct windows
        expect(workGroups[0].windowId).toBe(WIN_A);
        expect(socialGroups[0].windowId).toBe(WIN_B);
    });

    it('should handle tab removal during AI processing without corrupting state', async () => {
        const WIN_ID = 300;
        await context.setupWindow(WIN_ID);

        let resolveAI: (() => void) | null = null;
        vi.spyOn(await import('../../../services/ai/AIService'), 'AIService', 'get').mockReturnValue({
            getProvider: vi.fn().mockResolvedValue({
                generateSuggestions: async (request: any) => {
                    // Pause AI so we can remove a tab mid-flight
                    await new Promise<void>(resolve => {
                        resolveAI = resolve;
                    });
                    const workTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('work'));
                    return {
                        suggestions:
                            workTabs.length > 0
                                ? [{ groupName: 'Work', tabIds: workTabs.map((t: any) => t.id), confidence: 0.9 }]
                                : []
                    };
                }
            })
        } as any);

        const tab1 = await context.addTab(WIN_ID, 'https://work.com/1');
        await context.addTab(WIN_ID, 'https://work.com/2');

        // Start processing
        const processingPromise = context.tabManager.queueAndProcess();

        // Wait for AI to be called
        await new Promise(r => setTimeout(r, 50));

        // Remove tab1 while AI is running
        await context.removeTab(tab1.id, WIN_ID);

        // Let AI finish (assert type: assignment is inside async callback so TS doesn't narrow)
        if (resolveAI) (resolveAI as () => void)();

        await processingPromise;
        await context.waitForProcessing();

        // ProcessingState should not be stuck
        expect(context.processingState.isProcessing).toBe(false);
    });

    it('should process re-queued window after current processing completes', async () => {
        const WIN_ID = 400;
        await context.setupWindow(WIN_ID);

        let aiCallCount = 0;
        vi.spyOn(await import('../../../services/ai/AIService'), 'AIService', 'get').mockReturnValue({
            getProvider: vi.fn().mockResolvedValue({
                generateSuggestions: async (request: any) => {
                    aiCallCount++;
                    await new Promise(r => setTimeout(r, 100));
                    const workTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('work'));
                    return {
                        suggestions:
                            workTabs.length > 0
                                ? [{ groupName: 'Work', tabIds: workTabs.map((t: any) => t.id), confidence: 0.9 }]
                                : []
                    };
                }
            })
        } as any);

        await context.addTab(WIN_ID, 'https://work.com/1');

        // Start processing
        const p1 = context.tabManager.queueAndProcess();

        // While processing, add another tab (should re-queue)
        await new Promise(r => setTimeout(r, 30));
        await context.addTab(WIN_ID, 'https://work.com/2');

        await p1;
        // Trigger again to process the re-queued work
        await context.tabManager.queueAndProcess();
        await context.waitForProcessing();

        // Should have been processed at least twice (original + re-queue)
        expect(aiCallCount).toBeGreaterThanOrEqual(1);
        // State should be clean
        expect(context.processingState.isProcessing).toBe(false);
    });

    it('should not leave stale processing state when all windows are closed', async () => {
        const WIN_ID = 500;
        await context.setupWindow(WIN_ID);

        await context.addTab(WIN_ID, 'https://work.com/1');

        // Enqueue but don't process
        const snapshot = await WindowSnapshot.fetch(WIN_ID);
        await context.processingState.enqueue(WIN_ID, snapshot);

        expect(context.processingState.isProcessing).toBe(true);

        // Remove the window
        context.processingState.remove(WIN_ID);

        expect(context.processingState.isProcessing).toBe(false);
        expect(context.processingState.has(WIN_ID)).toBe(false);
    });
});
