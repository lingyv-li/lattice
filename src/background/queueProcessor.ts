import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { SettingsStorage, AppSettings, AIProviderType } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { AbortError } from '../utils/AppError';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';
import { GroupIdManager } from './GroupIdManager';
import { WindowSnapshot } from '../utils/snapshots';

const BATCH_SIZE = 10;

export class QueueProcessor {
    private windowAbortControllers = new Map<number, AbortController>();

    // Track context of currently processing windows for smart abort checks
    private processingContext = new Map<number, {
        batchTabIds: number[],
        snapshot: WindowSnapshot,
        controller: AbortController
    }>();

    constructor(private state: ProcessingState) {
        // Subscribe to re-queue events to check for fatal changes
        this.state.onWindowRequeued = (windowId) => this.checkFatalChange(windowId);
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

    async process(): Promise<void> {
        console.log(`[QueueProcessor] [${new Date().toISOString()}] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            const settings = await SettingsStorage.get();
            if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Tab Grouper feature is disabled, stopping.`);
                return;
            }

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
                    const batches = windowState.inputSnapshot.getBatches(BATCH_SIZE);

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
                    let windowProcessingAborted = false;

                    for (const batchTabs of batches) {
                        const result = await this.processWindowBatch(
                            windowId,
                            batchTabs,
                            groupIdManager,
                            settings
                        );

                        if (batches.length > 1) {
                            console.log(`[QueueProcessor] Processed batch ${batches.indexOf(batchTabs) + 1}/${batches.length} for window ${windowId}`);
                        }

                        if (result.aborted) {
                            windowProcessingAborted = true;
                            break;
                        }
                    }

                    // Complete window if not aborted (snapshot already persisted above)
                    if (!windowProcessingAborted) {
                        await this.state.completeWindow(windowId);
                    }

                    // Clean up abort controller
                    this.windowAbortControllers.delete(windowId);
                }
            } catch (err: unknown) {
                console.error("[QueueProcessor] Global processing error", err);
            }
        }
    }

    private async processWindowBatch(
        windowId: number,
        batchTabs: chrome.tabs.Tab[],
        groupIdManager: GroupIdManager,
        settings: AppSettings
    ): Promise<{ aborted: boolean }> {
        // Check snapshot before each batch (uses centralized function)
        const windowState = this.state.getWindowState(windowId);

        if (!windowState || !(await windowState.verifySnapshot())) {
            // Initial check still useful, but less critical now with smart aborts.
            // We'll trust verifySnapshot for the initial queue pick-up.
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Window ${windowId} aborted: Snapshot changed before batch. Re-queuing.`);
            await this.state.add(windowId, true);
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
                batchTabIds: batchTabs.map(t => t.id!).filter(id => id !== undefined),
                snapshot: windowState.inputSnapshot,
                controller
            });

            const promptInput = windowState.inputSnapshot.getPromptForBatch(
                batchTabs,
                groupIdManager.getGroupMap(),
                settings.customGroupingRules
            );

            const results = await provider.generateSuggestions({
                ...promptInput,
                signal: controller.signal
            });

            // Clear context on success
            this.processingContext.delete(windowId);

            const batchDuration = Date.now() - batchStartTime;
            console.log(`[QueueProcessor] [${new Date().toISOString()}] AI results for window ${windowId}:`, results.suggestions.map(s => s.groupName), `(took ${batchDuration}ms)`);

            const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;
            const groupedTabIds = new Set<number>();
            const suggestionsToCache = [];
            const now = Date.now();

            // Final safety check: Check for fatal changes one last time before applying
            // This covers the gap between the last re-queue check and now.
            const finalSnapshot = await WindowSnapshot.fetch(windowId);
            if (windowState.inputSnapshot.isFatalChange(finalSnapshot, batchTabs.map(t => t.id!).filter(id => id !== undefined))) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Fatal change detected immediately before applying. Skipping batch.`);
                return { aborted: false }; // Not strictly aborted, just skipped this batch. Window loop continues? Or should we return aborted?
                // If we return aborted=false, the loop continues to next batch. But state changed.
                // Probably safer to return aborted=true to force re-evaluation of the whole window.
                await this.state.add(windowId, true);
                return { aborted: true };
            }

            for (const suggestion of results.suggestions) {
                try {
                    // Resolve group ID (virtual or real)
                    const groupId = groupIdManager.resolveGroupId(
                        suggestion.groupName,
                        suggestion.existingGroupId
                    );

                    if (autopilotEnabled) {
                        const newGroupId = await applyTabGroup(
                            suggestion.tabIds,
                            suggestion.groupName,
                            groupIdManager.toRealIdOrNull(groupId),
                            windowId
                        );

                        if (newGroupId) {
                            groupIdManager.updateWithRealId(suggestion.groupName, newGroupId);
                        }
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
