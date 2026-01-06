import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestContext } from './setup';
import { SettingsStorage, AIProviderType } from '../../../utils/storage';
import { FeatureId } from '../../../types/features';

describe('Integration Flow: Auto-Grouping & Smart Abort', () => {
    let context: TestContext;

    beforeEach(() => {
        vi.clearAllMocks();
        context = new TestContext();

        // Default Settings: Enabled, Autopilot ON, Mock Provider
        vi.spyOn(SettingsStorage, 'get').mockResolvedValue({
            aiProvider: AIProviderType.Gemini,
            features: {
                [FeatureId.TabGrouper]: {
                    enabled: true,
                    autopilot: true
                }
            },
            hasCompletedOnboarding: true
        } as any);
    });

    it('Scenario 1: Auto-Grouping - Should group tabs based on URL content', async () => {
        const WIN_ID = 1;
        await context.setupWindow(WIN_ID);

        // Debug listener count
        // @ts-expect-error - Accessing internal _events for testing
        console.log(`[FlowTest] Tabs OnCreated Listeners: ${context.chrome._events.tabsOnCreated.hasListener((context.tabManager as any).listeners?.tabs?.onCreated) ?? 'unknown'} `);

        // 1. Add some tabs that should be grouped
        await context.addTab(WIN_ID, 'https://work.com/jira/1');
        await context.addTab(WIN_ID, 'https://work.com/docs/2');

        // 2. Trigger processing manually (bypass debounce)
        console.log("[FlowTest] Manually triggering queueAndProcess");
        await context.tabManager.queueAndProcess();

        await context.waitForProcessing();

        // 3. Verify groups in FakeChrome
        const groups = context.chrome.groups;
        expect(groups).toHaveLength(1);
        expect(groups[0].title).toBe('Work');

        // Expect tabs to be in that group
        const tabs = context.chrome.tabs;
        expect(tabs[0].groupId).toBe(groups[0].id);
        expect(tabs[1].groupId).toBe(groups[0].id);
    });

    it('Scenario 2: Smart Abort - Should handle gracefully when tab is removed before processing', async () => {
        const WIN_ID = 2;
        await context.setupWindow(WIN_ID);

        // 1. Add tab (this triggers onCreated but we won't wait for debounce)
        const tab1 = await context.addTab(WIN_ID, 'https://work.com/jira/3');

        // 2. Immediately remove the tab before debounce fires (debounce is 1500ms)
        // This simulates user quickly closing a tab they just opened
        await context.removeTab(tab1.id, WIN_ID);

        // 3. Now manually trigger processing to see if it handles the missing tab
        await context.tabManager.queueAndProcess();
        await context.waitForProcessing();

        // 4. Verify: No groups should be created since window has no tabs left
        const groups = context.chrome.groups;
        expect(groups).toHaveLength(0); // Should not have created a group for a missing tab
    });

    it('Scenario 3: Mixed content - Groups correctly', async () => {
        const WIN_ID = 3;
        await context.setupWindow(WIN_ID);

        await context.addTab(WIN_ID, 'https://social.com/feed');
        await context.addTab(WIN_ID, 'https://work.com/tasks');
        // 2. Trigger processing
        await context.tabManager.queueAndProcess();
        await context.waitForProcessing();

        // Expect 2 groups
        const groups = context.chrome.groups;
        expect(groups).toHaveLength(2);

        const titles = groups.map(g => g.title).sort();
        expect(titles).toEqual(['Social', 'Work']);
    });

    it('Scenario 4: Smart Abort - Should abort AI call when fatal change detected during processing', async () => {
        const WIN_ID = 4;
        await context.setupWindow(WIN_ID);

        // Track if abort signal was triggered
        let abortSignalTriggered = false;
        let aiCallStarted = false;
        let aiCallCount = 0;

        // Override AIService mock with a DELAYED version that checks abort signal
        vi.spyOn(await import('../../../services/ai/AIService'), 'AIService', 'get').mockReturnValue({
            getProvider: vi.fn().mockResolvedValue({
                generateSuggestions: async (request: any) => {
                    aiCallCount++;
                    aiCallStarted = true;
                    console.error(`[MockAI-Delayed] AI call #${aiCallCount} started, waiting 200ms...`);

                    // Wait for 200ms, but check abort signal
                    await new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => resolve(), 200);

                        if (request.signal) {
                            request.signal.addEventListener('abort', () => {
                                abortSignalTriggered = true;
                                clearTimeout(timeout);
                                reject(new Error('Aborted'));
                            });
                        }
                    });

                    console.error(`[MockAI-Delayed] AI call #${aiCallCount} completed (not aborted)`);

                    // Return work group suggestion
                    const workTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('work'));
                    return {
                        suggestions: workTabs.length > 0 ? [{
                            groupName: 'Work',
                            tabIds: workTabs.map((t: any) => t.id),
                            confidence: 0.9
                        }] : []
                    };
                }
            })
        } as any);

        // 1. Add tabs
        const tab1 = await context.addTab(WIN_ID, 'https://work.com/project');
        await context.addTab(WIN_ID, 'https://work.com/tasks');

        // 2. Start processing in the background
        const processingPromise = context.tabManager.queueAndProcess();

        // 3. Wait a bit for AI call to start, then simulate user grouping a tab manually (fatal change)
        await new Promise(r => setTimeout(r, 50));

        if (aiCallStarted) {
            console.log("[Test] AI call started, now simulating fatal change (manual group)");
            // Simulate user manually grouping a tab - this is a fatal change
            // We do this by modifying the tab's groupId directly and triggering re-queue
            tab1.groupId = 999; // User manually grouped this tab

            // Trigger the re-queue which should detect fatal change and abort
            await context.processingState.enqueue(WIN_ID,
                await (await import('../../../utils/snapshots')).WindowSnapshot.fetch(WIN_ID),
                true // isRequeue
            );
        }

        // 4. Wait for processing to complete (or abort)
        await processingPromise.catch(() => { }); // Ignore abort errors
        await context.waitForProcessing();

        // 5. Verify abort behavior:
        console.log(`[Test] Abort signal triggered: ${abortSignalTriggered}, AI started: ${aiCallStarted}, AI call count: ${aiCallCount}`);

        // Key assertions:
        // a) The abort signal was triggered  
        expect(abortSignalTriggered).toBe(true);

        // b) The AI was called at least twice (first aborted, second for re-process)
        expect(aiCallCount).toBeGreaterThanOrEqual(2);

        // c) Tab1 (which user manually grouped) should NOT be in any extension-created group
        // Tab1's groupId should still be 999 (user's manual group), not overwritten
        expect(tab1.groupId).toBe(999);

        // d) Tab2 may or may not be grouped depending on timing, that's OK
        // The important thing is that tab1 wasn't re-grouped by the extension
    });
});
