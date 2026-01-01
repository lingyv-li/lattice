import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { SettingsStorage, AppSettings } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';

const BATCH_SIZE = 10;

export class QueueProcessor {
    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        console.log(`[QueueProcessor] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            const settings = await SettingsStorage.get();
            if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
                console.log("[QueueProcessor] Tab Grouper feature is disabled, stopping.");
                this.state.release();
                return;
            }

            const windowIds = this.state.acquireQueue() as number[];
            if (windowIds.length === 0) {
                console.log(`[QueueProcessor] Failed to acquire queue (Busy or Empty)`);
                return;
            }

            console.log(`[QueueProcessor] Starting processing for ${windowIds.length} windows`);

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
                    const virtualGroups = new Map<string, number>();

                    let nextVirtualId = -1;
                    let windowProcessingAborted = false;

                    for (const batchTabs of batches) {
                        const wrap = { nextVirtualId };

                        windowProcessingAborted = await this.processWindowBatch(
                            windowId,
                            batchTabs,
                            virtualGroups,
                            wrap,
                            settings
                        );

                        nextVirtualId = wrap.nextVirtualId;
                        if (windowProcessingAborted) break;
                    }

                    if (!windowProcessingAborted) {
                        // Persist the snapshot that was captured at enqueue time
                        await this.state.completeWindow(windowId);
                    }
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
        virtualGroups: Map<string, number>,
        state: { nextVirtualId: number },
        settings: AppSettings
    ): Promise<boolean> {
        // Check snapshot before each batch (uses centralized function)
        const windowState = this.state.getWindowState(windowId);

        if (!windowState || !(await windowState.verifySnapshot())) {
            console.log(`[QueueProcessor] Window ${windowId} aborted: Snapshot changed before batch. Re-queuing.`);
            await this.state.add(windowId);
            return true;
        }


        try {
            const provider = await AIService.getProvider(settings);
            console.log(`[QueueProcessor] Prompting AI in window ${windowId}`);

            const promptInput = windowState.inputSnapshot.getPromptForBatch(
                batchTabs,
                virtualGroups,
                settings.customGroupingRules
            );

            const results = await provider.generateSuggestions(promptInput);

            console.log(`[QueueProcessor] AI results:`, results.suggestions.map(s => s.groupName));

            const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;
            const groupedTabIds = new Set<number>();
            const suggestionsToCache = [];
            const now = Date.now();

            for (const suggestion of results.suggestions) {
                try {
                    // 1. Determine/Create Virtual or Real ID
                    let groupId = suggestion.existingGroupId || virtualGroups.get(suggestion.groupName) || null;

                    if (!groupId) {
                        // Assign a virtual ID for consistent cross-batch grouping in this window cycle
                        groupId = state.nextVirtualId--;
                        virtualGroups.set(suggestion.groupName, groupId);
                    }

                    if (autopilotEnabled) {
                        const newGroupId = await applyTabGroup(
                            suggestion.tabIds,
                            suggestion.groupName,
                            groupId && groupId > 0 ? groupId : null,
                            windowId
                        );

                        if (newGroupId) {
                            virtualGroups.set(suggestion.groupName, newGroupId);
                            groupId = newGroupId;
                        }
                    } else {
                        // Only add to cache loop if not autopilot (as per test expectations)
                        for (const tabId of suggestion.tabIds) {
                            suggestionsToCache.push({
                                tabId,
                                windowId,
                                groupName: suggestion.groupName,
                                existingGroupId: groupId && groupId > 0 ? groupId : null,
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

        return false;
    }
}
