import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { mapExistingGroups } from '../services/ai/shared';
import { SettingsStorage, AIProviderType } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';

const BATCH_SIZE = 10;

export class QueueProcessor {
    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        // Simple loop to drain the queue completely.
        // If items are added while we process, we loop again.
        console.log(`[QueueProcessor] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            const settings = await SettingsStorage.get();
            if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
                console.log("[QueueProcessor] Tab Grouper feature is disabled, clearing queue and stopping.");
                this.state.release(); // Important to release so it doesn't stay busy
                // We might want to clear the queue items in state too if they were specifically for grouping
                return;
            }

            // acquireQueue() returns empty array if already busy, 
            // but we shouldn't be calling process() re-entrantly anyway ideally.
            // However, to be safe, we check result.
            const tabIds = this.state.acquireQueue();
            if (tabIds.length === 0) {
                console.log(`[QueueProcessor] Failed to acquire queue (Busy or Empty)`);
                return;
            }

            console.log(`[QueueProcessor] Starting processing for ${tabIds.length} tabs`);

            try {
                // Fetch all tabs in the queue to determine their windows
                const tabsInQueue = await Promise.all(tabIds.map((id: number) => chrome.tabs.get(id).catch(() => null)));
                const validTabs = tabsInQueue.filter(t => t !== null && t.id && t.url && t.title) as chrome.tabs.Tab[];

                // Group by windowId
                const tabsByWindow = new Map<number, chrome.tabs.Tab[]>();
                for (const tab of validTabs) {
                    const winId = tab.windowId;
                    if (!tabsByWindow.has(winId)) tabsByWindow.set(winId, []);
                    tabsByWindow.get(winId)!.push(tab);
                }

                for (const [windowId, tabs] of tabsByWindow) {
                    try {
                        const window = await chrome.windows.get(windowId);
                        if (window.type !== chrome.windows.WindowType.NORMAL) continue;
                    } catch (e) {
                        continue;
                    }

                    // Fetch groups once per window cycle
                    const existingGroups = await chrome.tabGroups.query({ windowId });
                    const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));
                    const groupNameMap = mapExistingGroups(existingGroupsData);

                    // Track virtual groups discovered during this window iteration
                    const virtualGroups = new Map<string, number>();
                    let nextVirtualId = -1;

                    // BATCH PROCESSING per window
                    for (let i = 0; i < tabs.length; i += BATCH_SIZE) {
                        // 1. CHECK STALENESS BEFORE EACH BATCH
                        if (this.state.isStale) {
                            console.log(`[QueueProcessor] Processing aborted: State is STALE`);
                            return;
                        }

                        const batchTabs = tabs.slice(i, i + BATCH_SIZE);
                        const batchTabsData = batchTabs.map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

                        // Combine existing and virtual for AI
                        const windowGroupNameMap = new Map(groupNameMap);
                        for (const [name, id] of virtualGroups) {
                            if (!windowGroupNameMap.has(name)) {
                                windowGroupNameMap.set(name, id);
                            }
                        }

                        const settings = await SettingsStorage.get();
                        if (settings.aiProvider === AIProviderType.None) continue;

                        const provider = await AIService.getProvider(settings);

                        console.log(`[QueueProcessor] Prompting AI for batch of ${batchTabs.length} tabs in window ${windowId}`);
                        const { suggestions: groups, errors } = await provider.generateSuggestions(
                            {
                                existingGroups: windowGroupNameMap,
                                ungroupedTabs: batchTabsData,
                                customRules: settings.customGroupingRules
                            }
                        );
                        console.log(`[QueueProcessor] AI response for batch of ${batchTabs.length} tabs in window ${windowId}:`, groups);

                        if (errors.length > 0) {
                            console.warn(`[QueueProcessor] Batch errors for window ${windowId}:`, errors);
                            for (const err of errors) {
                                try {
                                    await ErrorStorage.addError(getUserFriendlyError(err));
                                    break;
                                } catch (e) {
                                    console.error("[QueueProcessor] Failed to persist batch error", e);
                                }
                            }
                        }

                        // 3. CHECK STALENESS AFTER AI (INCLUDES TAB/GROUP CHANGES)
                        if (this.state.isStale) {
                            console.log(`[QueueProcessor] Batch discarded: State became STALE during AI call`);
                            return;
                        }

                        const currentTabs = await Promise.all(
                            batchTabsData.map(t => chrome.tabs.get(t.id).catch(() => null))
                        );

                        if (this.state.isStale) {
                            console.log(`[QueueProcessor] Batch discarded: State became STALE during tab validation`);
                            return;
                        }

                        const currentValidTabs = currentTabs.filter(t => t && t.url && t.title) as chrome.tabs.Tab[];

                        // Update virtual groups for subsequent batches in this window
                        for (const group of groups) {
                            if (group.existingGroupId === null && group.groupName) {
                                if (!virtualGroups.has(group.groupName)) {
                                    virtualGroups.set(group.groupName, nextVirtualId--);
                                }
                            }
                        }

                        // 4. APPLY RESULTS
                        const now = Date.now();
                        const groupedTabIds = new Set<number>();
                        const suggestionsToUpdate = [];
                        const validCurrentTabs = currentValidTabs.filter(t => t.windowId === windowId);

                        for (const group of groups) {
                            const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;

                            if (autopilotEnabled) {
                                const validTabIds = group.tabIds.filter(id => validCurrentTabs.find(t => t.id === id));
                                if (validTabIds.length > 0) {
                                    await applyTabGroup(validTabIds, group.groupName, group.existingGroupId, windowId);
                                    for (const tid of validTabIds) groupedTabIds.add(tid);
                                }
                            } else {
                                for (const tabId of group.tabIds) {
                                    if (!validCurrentTabs.find(t => t.id === tabId)) continue;
                                    groupedTabIds.add(tabId);
                                    suggestionsToUpdate.push({
                                        tabId,
                                        groupName: group.groupName,
                                        existingGroupId: group.existingGroupId || null,
                                        timestamp: now
                                    });
                                }
                            }
                        }

                        if (suggestionsToUpdate.length > 0) {
                            await StateService.updateSuggestions(suggestionsToUpdate);
                        }

                        // Cache negative results
                        const negativeSuggestions = [];
                        for (const tab of batchTabsData) {
                            if (!groupedTabIds.has(tab.id)) {
                                negativeSuggestions.push({
                                    tabId: tab.id,
                                    groupName: null,
                                    existingGroupId: null,
                                    timestamp: now
                                });
                            }
                        }

                        if (negativeSuggestions.length > 0) {
                            await StateService.updateSuggestions(negativeSuggestions);
                        }
                    }
                }
            } catch (err: any) {
                console.error("[QueueProcessor] Processing error", err);
                try {
                    await ErrorStorage.addError(getUserFriendlyError(err));
                } catch (e) {
                    console.error("[QueueProcessor] Failed to handle error state", e);
                }
            } finally {
                this.state.release();
            }
        }
    }
}
