import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { SettingsStorage, AppSettings, AIProviderType, isFeatureEnabled, isFeatureAutopilot } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup, getTabIds } from '../utils/tabs';
import { AbortError } from '../utils/AppError';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';
import { GroupIdManager } from './GroupIdManager';
import { WindowSnapshot } from '../utils/snapshots';

export class QueueProcessor {
    private windowAbortControllers = new Map<number, AbortController>();

    // Track context of currently processing windows for smart abort checks
    private processingContext = new Map<
        number,
        {
            batchTabIds: number[];
            snapshot: WindowSnapshot;
            controller: AbortController;
        }
    >();

    constructor(private state: ProcessingState) {
        // Subscribe to re-queue events to check for fatal changes
        this.state.onWindowRequeued = windowId => this.checkFatalChange(windowId);
        // Subscribe to removal events to abort processing
        this.state.onWindowRemoved = windowId => this.handleWindowRemoved(windowId);
    }

    private handleWindowRemoved(windowId: number) {
        const context = this.processingContext.get(windowId);
        if (context) {
            // console.log(`[QueueProcessor] Window ${windowId} removed from state (Closed?). Aborting AI request.`);
            context.controller.abort();
            this.processingContext.delete(windowId);
            this.windowAbortControllers.delete(windowId);
        }
    }

    private checkFatalChange(windowId: number) {
        const context = this.processingContext.get(windowId);
        if (!context) return;

        console.log(`[QueueProcessor] Window ${windowId} re-queued while active. Checking for fatal changes...`);

        // Get the NEW snapshot (already updated in state by the add() call)
        const windowState = this.state.getWindowState(windowId);
        if (!windowState) return;

        const newSnapshot = windowState.inputSnapshot;

        // Check if the change is fatal for the CURRENT batch
        if (context.snapshot.isFatalChange(newSnapshot, context.batchTabIds)) {
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Fatal change detected for window ${windowId}. Aborting AI request.`);
            context.controller.abort();
            this.processingContext.delete(windowId);
        } else {
            console.log(`[QueueProcessor] Change in window ${windowId} is benign (non-fatal). Continuing AI request.`);
        }
    }

    private getBatchSize(settings: AppSettings): number {
        // For Gemini Cloud, we want to disable batching (or use a very high limit)
        // because it handles large contexts well and batching slows it down/costs more requests.
        if (settings.aiProvider === AIProviderType.Gemini) {
            return 200;
        }
        // Default for Local AI and others
        return 10;
    }

    async process(): Promise<void> {
        console.log(`[QueueProcessor] [${new Date().toISOString()}] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            const settings = await SettingsStorage.get();
            if (!isFeatureEnabled(settings, FeatureId.TabGrouper)) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Tab Grouper feature is disabled, stopping.`);
                return;
            }

            const batchSize = this.getBatchSize(settings);
            console.log(`[QueueProcessor] Using batch size: ${batchSize} for provider: ${settings.aiProvider}`);

            const windowIds = this.state.acquireQueue() as number[];
            if (windowIds.length === 0) {
                console.log(`[QueueProcessor] Failed to acquire queue (Busy or Empty)`);
                return;
            }

            console.log(`[QueueProcessor] [${new Date().toISOString()}] Starting processing for ${windowIds.length} windows`);

            try {
                for (const windowId of windowIds) {
                    // The snapshot was already captured at enqueue time in TabManager
                    const windowState = this.state.getWindowState(windowId);
                    if (!windowState) {
                        console.error(`[QueueProcessor] No window state for ${windowId}`);
                        await this.state.completeWindow(windowId);
                        continue;
                    }

                    // Reconstruct valid tabs from snapshot (to avoid race conditions)
                    const batches = windowState.inputSnapshot.getBatches(batchSize);

                    if (batches.length === 0) {
                        console.log(`[QueueProcessor] No valid ungrouped tabs in window ${windowId}`);
                        await this.state.completeWindow(windowId);
                        continue;
                    }

                    try {
                        const window = await chrome.windows.get(windowId);
                        if (window.type !== chrome.windows.WindowType.NORMAL) {
                            await this.state.completeWindow(windowId);
                            continue;
                        }
                    } catch {
                        await this.state.completeWindow(windowId);
                        continue;
                    }

                    const groupIdManager = new GroupIdManager();
                    for (const batchTabs of batches) {
                        const result = await this.processWindowBatch(windowId, batchTabs, groupIdManager, settings);

                        if (batches.length > 1) {
                            console.log(`[QueueProcessor] Processed batch ${batches.indexOf(batchTabs) + 1}/${batches.length} for window ${windowId}`);
                        }

                        if (result.aborted) {
                            break;
                        }
                    }

                    // Complete window (mark processing done, persist state if needed)
                    // Even if aborted, we must release the 'active' lock on this window.
                    // If it was re-queued, completeWindow handles keeping the state.
                    await this.state.completeWindow(windowId);

                    // Clean up abort controller
                    this.windowAbortControllers.delete(windowId);
                }
            } catch (err: unknown) {
                console.error('[QueueProcessor] Global processing error', err);
            }
        }
    }

    private async processWindowBatch(windowId: number, batchTabs: chrome.tabs.Tab[], groupIdManager: GroupIdManager, settings: AppSettings): Promise<{ aborted: boolean }> {
        // Check snapshot before each batch (uses centralized function)
        const windowState = this.state.getWindowState(windowId);

        if (!windowState || !(await windowState.verifySnapshot())) {
            // Initial check still useful, but less critical now with smart aborts.
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Window ${windowId} aborted: Snapshot changed before batch. Re-queuing.`);

            // Re-fetch fresh snapshot
            const newSnapshot = await WindowSnapshot.fetch(windowId);

            // Re-enqueue using new signature (enqueue handles persistence)
            await this.state.enqueue(windowId, newSnapshot, true);
            return { aborted: true };
        }
        try {
            const provider = await AIService.getProvider(settings);
            const batchStartTime = Date.now();
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Prompting AI in window ${windowId}`);

            // Create abort controller for this window's request
            const controller = new AbortController();
            this.windowAbortControllers.set(windowId, controller);

            // Register processing context for smart aborts
            this.processingContext.set(windowId, {
                batchTabIds: getTabIds(batchTabs),
                snapshot: windowState.inputSnapshot,
                controller
            });

            const promptInput = windowState.inputSnapshot.getPromptForBatch(batchTabs, groupIdManager.getGroupMap(), settings.customGroupingRules);

            const results = await provider.generateSuggestions({
                ...promptInput,
                signal: controller.signal
            });

            // Clear context on success
            this.processingContext.delete(windowId);

            const batchDuration = Date.now() - batchStartTime;
            console.log(
                `[QueueProcessor] [${new Date().toISOString()}] AI results for window ${windowId}:`,
                results.suggestions.map(s => s.groupName),
                `(took ${batchDuration}ms)`
            );

            // Clear stored errors when we got a clean result (no new errors reported).
            if (!results.errors || results.errors.length === 0) {
                await ErrorStorage.clearErrors();
            }

            if (results.errors && results.errors.length > 0) {
                const realErrors = results.errors.filter(e => !(e instanceof AbortError));
                if (realErrors.length > 0) {
                    console.error(`[QueueProcessor] [${new Date().toISOString()}] AI reported errors:`, realErrors);
                    const uniqueErrors = new Set(realErrors.map(e => getUserFriendlyError(e)));
                    for (const msg of uniqueErrors) {
                        await ErrorStorage.addError(msg);
                    }
                }
            }

            const autopilotEnabled = isFeatureAutopilot(settings, FeatureId.TabGrouper);
            const groupedTabIds = new Set<number>();
            const suggestionsToCache = [];
            const now = Date.now();

            // Final safety check: Check for fatal changes one last time before applying
            // This covers the gap between the last re-queue check and now.
            const finalSnapshot = await WindowSnapshot.fetch(windowId);
            if (windowState.inputSnapshot.isFatalChange(finalSnapshot, getTabIds(batchTabs))) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Fatal change detected immediately before applying. Re-queuing.`);
                await this.state.enqueue(windowId, finalSnapshot, true);
                return { aborted: true };
            }

            for (const suggestion of results.suggestions) {
                try {
                    // Resolve group ID (virtual or real)
                    const groupId = groupIdManager.resolveGroupId(suggestion.groupName, suggestion.existingGroupId);

                    if (autopilotEnabled) {
                        const newGroupId = await applyTabGroup(suggestion.tabIds, suggestion.groupName, groupIdManager.toRealIdOrNull(groupId), windowId);

                        if (newGroupId) {
                            groupIdManager.updateWithRealId(suggestion.groupName, newGroupId);
                        }
                        await StateService.pushGroupAction({
                            windowId,
                            tabIds: suggestion.tabIds,
                            groupName: suggestion.groupName,
                            existingGroupId: groupIdManager.toRealIdOrNull(groupId)
                        });
                    } else {
                        // Cache suggestions for manual review
                        for (const tabId of suggestion.tabIds) {
                            suggestionsToCache.push({
                                tabId,
                                windowId,
                                groupName: suggestion.groupName,
                                existingGroupId: groupIdManager.toRealIdOrNull(groupId),
                                timestamp: now
                            });
                        }
                    }

                    // Track which tabs were handled
                    suggestion.tabIds.forEach(tid => groupedTabIds.add(tid));
                } catch (e) {
                    console.error(`[QueueProcessor] Error applying suggestion:`, e);
                }
            }

            if (suggestionsToCache.length > 0) {
                await StateService.updateSuggestions(suggestionsToCache);
            }
        } catch (e: unknown) {
            // Handle AbortError specifically
            if (e instanceof AbortError) {
                console.log(`[QueueProcessor] Processing aborted for window ${windowId}`);
                return { aborted: true };
            }

            // Don't show error if user hasn't configured an AI provider yet
            if (settings.aiProvider !== AIProviderType.None) {
                const errorMsg = getUserFriendlyError(e);
                console.error(`[QueueProcessor] AI Error in window ${windowId}:`, e);
                await ErrorStorage.addError(errorMsg);
            } else {
                console.log(`[QueueProcessor] Skipping AI processing: No provider configured`);
            }
        } finally {
            this.windowAbortControllers.delete(windowId);
            this.processingContext.delete(windowId);
        }

        return { aborted: false };
    }
}
