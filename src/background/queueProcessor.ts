import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { SettingsStorage, AppSettings } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';
import { GroupIdManager } from './GroupIdManager';

const BATCH_SIZE = 10;

export class QueueProcessor {
    private windowAbortControllers = new Map<number, AbortController>();

    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        console.log(`[QueueProcessor] [${new Date().toISOString()}] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            const settings = await SettingsStorage.get();
            if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Tab Grouper feature is disabled, stopping.`);
                this.state.release();
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
                    } catch (e) {
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
            } catch (err: any) {
                console.error("[QueueProcessor] Global processing error", err);
            } finally {
                this.state.release();
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
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Window ${windowId} aborted: Snapshot changed before batch. Re-queuing.`);
            // Abort any in-progress AI request
            const controller = this.windowAbortControllers.get(windowId);
            if (controller) {
                console.log(`[QueueProcessor] [${new Date().toISOString()}] Aborting AI request for window ${windowId}`);
                controller.abort();
                this.windowAbortControllers.delete(windowId);
            }
            await this.state.add(windowId);
            return { aborted: true };
        }


        try {
            const provider = await AIService.getProvider(settings);
            const batchStartTime = Date.now();
            console.log(`[QueueProcessor] [${new Date().toISOString()}] Prompting AI in window ${windowId}`);

            // Create abort controller for this window's request
            const controller = new AbortController();
            this.windowAbortControllers.set(windowId, controller);

            const promptInput = windowState.inputSnapshot.getPromptForBatch(
                batchTabs,
                groupIdManager.getGroupMap(),
                settings.customGroupingRules
            );

            const results = await provider.generateSuggestions({
                ...promptInput,
                signal: controller.signal
            });

            const batchDuration = Date.now() - batchStartTime;
            console.log(`[QueueProcessor] [${new Date().toISOString()}] AI results for window ${windowId}:`, results.suggestions.map(s => s.groupName), `(took ${batchDuration}ms)`);

            const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;
            const groupedTabIds = new Set<number>();
            const suggestionsToCache = [];
            const now = Date.now();

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

        } catch (e: any) {
            const errorMsg = getUserFriendlyError(e);
            console.error(`[QueueProcessor] AI Error in window ${windowId}:`, e);
            await ErrorStorage.addError(errorMsg);
        }

        return { aborted: false };
    }
}
