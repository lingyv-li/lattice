import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { mapExistingGroups } from '../services/ai/shared';
import { SettingsStorage, AppSettings } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';
import { isGroupableTab } from '../utils/tabFilter';

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
                    const snapshotTabs = windowState.snapshotTabs;
                    const validTabs = snapshotTabs.filter((t: any) => isGroupableTab(t)) as { id: number; title: string; url: string }[];

                    if (validTabs.length === 0) {
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

                    // Reconstruct groups from snapshot
                    const snapshotGroups = windowState.snapshotGroups;
                    const groupNameMap = mapExistingGroups(snapshotGroups);

                    const virtualGroups = new Map<string, number>();
                    let nextVirtualId = -1;
                    let windowProcessingAborted = false;

                    for (let i = 0; i < validTabs.length; i += BATCH_SIZE) {
                        const batchTabsData = validTabs.slice(i, i + BATCH_SIZE);
                        const wrap = { nextVirtualId };

                        windowProcessingAborted = await this.processWindowBatch(
                            windowId,
                            batchTabsData,
                            groupNameMap,
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
        batchTabsData: { id: number; title: string; url: string }[],
        groupNameMap: Map<string, number>,
        virtualGroups: Map<string, number>,
        state: { nextVirtualId: number },
        settings: AppSettings
    ): Promise<boolean> {
        // 1. CHECK SNAPSHOT BEFORE EACH BATCH
        const [currentTabs, currentGroups] = await Promise.all([
            chrome.tabs.query({ windowId, groupId: chrome.tabs.TAB_ID_NONE }),
            chrome.tabGroups.query({ windowId })
        ]);

        const windowState = this.state.getWindowState(windowId);
        if (!windowState || !windowState.verifySnapshot(currentTabs, currentGroups)) {
            console.log(`[QueueProcessor] Window ${windowId} aborted: Snapshot changed before batch. Re-queuing.`);
            this.state.add(windowId, currentTabs, currentGroups);
            return true;
        }

        const windowGroupNameMap = new Map(groupNameMap);
        for (const [name, id] of virtualGroups) {
            if (!windowGroupNameMap.has(name)) {
                windowGroupNameMap.set(name, id);
            }
        }

        try {
            const provider = await AIService.getProvider(settings);
            console.log(`[QueueProcessor] Prompting AI in window ${windowId}`);

            const results = await provider.generateSuggestions({
                ungroupedTabs: batchTabsData,
                existingGroups: windowGroupNameMap,
                customRules: settings.customGroupingRules
            });

            console.log(`[QueueProcessor] AI results:`, results.suggestions.map(s => s.groupName));

            const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;
            const groupedTabIds = new Set<number>();
            const suggestionsToCache = [];
            const now = Date.now();

            for (const suggestion of results.suggestions) {
                try {
                    // 1. Determine/Create Virtual or Real ID
                    let groupId = suggestion.existingGroupId || virtualGroups.get(suggestion.groupName) || null;

                    if (!groupId && !groupNameMap.has(suggestion.groupName)) {
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

            // 2. Add Negative Results (tabs explicitly not grouped by AI)
            for (const tab of batchTabsData) {
                if (!groupedTabIds.has(tab.id)) {
                    suggestionsToCache.push({
                        tabId: tab.id,
                        windowId,
                        groupName: null,
                        existingGroupId: null,
                        timestamp: now
                    });
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
