import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { mapExistingGroups } from '../services/ai/shared';
import { SettingsStorage, AIProviderType } from '../utils/storage';
import { ErrorStorage } from '../utils/errorStorage';
import { applyTabGroup } from '../utils/tabs';
import { computeBatchHash } from '../utils/hash';
import { getUserFriendlyError } from '../utils/errors';
import { FeatureId } from '../types/features';

export class QueueProcessor {
    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        // Simple loop to drain the queue completely.
        // If items are added while we process, we loop again.
        console.log(`[QueueProcessor] process() called (Items: ${this.state.hasItems})`);

        while (this.state.hasItems) {
            // acquireQueue() returns empty array if already busy, 
            // but we shouldn't be calling process() re-entrantly anyway ideally.
            // However, to be safe, we check result.
            const tabIds = this.state.acquireQueue();
            if (tabIds.length === 0) {
                console.log(`[QueueProcessor] Failed to acquire queue (Busy or Empty)`);
                return; // Busy or empty
            }

            console.log(`[QueueProcessor] Starting batch for ${tabIds.length} tabs: ${tabIds.join(', ')}`);

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

                const now = Date.now();
                const cache = await StateService.getSuggestionCache();

                // Process per window
                for (const [windowId, tabs] of tabsByWindow) {
                    // Verify window type is normal
                    try {
                        const window = await chrome.windows.get(windowId);
                        if (window.type !== chrome.windows.WindowType.NORMAL) continue;
                    } catch (e) {
                        // Window might have closed
                        continue;
                    }

                    const existingGroups = await chrome.tabGroups.query({ windowId });
                    const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

                    const virtualGroups = new Map<string, { id: number; title: string }>();
                    let nextVirtualId = -1;

                    for (const cached of cache.values()) {
                        if (cached.existingGroupId === null && cached.groupName) {
                            if (!virtualGroups.has(cached.groupName)) {
                                virtualGroups.set(cached.groupName, { id: nextVirtualId--, title: cached.groupName });
                            }
                        }
                    }

                    const allGroups = [...existingGroupsData, ...virtualGroups.values()];
                    const tabsData = tabs.map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

                    // Compute batch hash for staleness detection
                    const inputBatchHash = computeBatchHash(
                        tabsData.map(t => ({ url: t.url, title: t.title })),
                        existingGroupsData
                    );

                    const settings = await SettingsStorage.get();

                    if (settings.aiProvider === AIProviderType.None) {
                        // AI is disabled, skip processing
                        continue;
                    }

                    const provider = await AIService.getProvider(settings);
                    const groupNameMap = mapExistingGroups(allGroups);

                    const { suggestions: groups, errors } = await provider.generateSuggestions(
                        {
                            existingGroups: groupNameMap,
                            ungroupedTabs: tabsData,
                            customRules: settings.customGroupingRules
                        },
                        () => { }
                    );

                    if (errors.length > 0) {
                        console.warn(`[QueueProcessor] ${errors.length} batch errors for window ${windowId}:`, errors);

                        for (const err of errors) {
                            try {
                                const errorMsg = getUserFriendlyError(err);

                                // Persist error stack
                                await ErrorStorage.addError(errorMsg);
                                break; // Show the first error found
                            } catch (e) {
                                console.error("[QueueProcessor] Failed to persist batch error", e);
                            }
                        }
                    }

                    // Batch staleness check: re-fetch all tabs and groups, compare hash
                    const currentTabs = await Promise.all(
                        tabsData.map(t => chrome.tabs.get(t.id).catch(() => null))
                    );
                    const currentValidTabs = currentTabs.filter(t => t && t.url && t.title) as chrome.tabs.Tab[];
                    const currentGroups = await chrome.tabGroups.query({ windowId });
                    const currentGroupsData = currentGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

                    const currentBatchHash = computeBatchHash(
                        currentValidTabs.map(t => ({ url: t.url!, title: t.title! })),
                        currentGroupsData
                    );

                    if (currentBatchHash !== inputBatchHash) {
                        console.log(`[QueueProcessor] Batch stale (input changed), discarding all results for window ${windowId}`);
                        continue;
                    }

                    // Batch is still fresh - apply results
                    const groupedTabIds = new Set<number>();

                    // Filter tabs that are still in the same window
                    const validCurrentTabs = currentValidTabs.filter(t => t.windowId === windowId);


                    // Standard: Cache suggestion
                    const suggestionsToUpdate = [];

                    for (const group of groups) {
                        // FIX: Use new features structure for autopilot check
                        const autopilotEnabled = settings.features?.[FeatureId.TabGrouper]?.autopilot ?? false;

                        if (autopilotEnabled) {
                            // Autopilot: Apply immediately
                            // Only include tabs that are still valid and in the correct window
                            const validTabIds = group.tabIds.filter(id => validCurrentTabs.find(t => t.id === id));

                            if (validTabIds.length > 0) {
                                await applyTabGroup(
                                    validTabIds,
                                    group.groupName,
                                    group.existingGroupId,
                                    windowId
                                );
                                for (const tid of validTabIds) groupedTabIds.add(tid);
                            }
                        } else {
                            // Standard: Collect for batch cache update
                            for (const tabId of group.tabIds) {
                                // Verify tab is still in the correct window
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

                    // Batch update for this window's groups
                    if (suggestionsToUpdate.length > 0) {
                        await StateService.updateSuggestions(suggestionsToUpdate);
                    }

                    // Cache negative results (tabs analyzed but not grouped)
                    const negativeSuggestions = [];
                    for (const tab of tabsData) {
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
            } catch (err: any) {
                console.error("[QueueProcessor] Processing error", err);

                try {
                    const errorMsg = getUserFriendlyError(err);
                    await ErrorStorage.addError(errorMsg);
                } catch (e) {
                    console.error("[QueueProcessor] Failed to handle error state", e);
                }
            } finally {
                // Always release lock
                this.state.release();
            }
        }
    }
}
