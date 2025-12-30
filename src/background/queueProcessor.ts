import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { mapExistingGroups } from '../services/ai/shared';
import { getSettings, AIProviderType } from '../utils/storage';
import { applyTabGroup } from '../utils/tabs';
import { computeBatchHash } from '../utils/hash';

export class QueueProcessor {
    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        if (this.state.size === 0) return;

        const tabIds = this.state.startProcessing();

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

                const settings = await getSettings();

                if (settings.aiProvider === AIProviderType.None) {
                    // AI is disabled, just clear the queue for these tabs so we don't retry forever
                    for (const tab of tabsData) {
                        this.state.finish(tab.id);
                    }
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
                    for (const tab of tabsData) {
                        this.state.finish(tab.id);
                    }
                    continue;
                }

                // Batch is still fresh - apply results
                const groupedTabIds = new Set<number>();

                for (const group of groups) {
                    if (settings.autopilot?.['tab-grouper']) {
                        // Autopilot: Apply immediately
                        const validTabIds = group.tabIds.filter(id => tabsData.find(t => t.id === id));
                        if (validTabIds.length > 0) {
                            await applyTabGroup(
                                validTabIds,
                                group.groupName,
                                group.existingGroupId
                            );
                            for (const tid of validTabIds) groupedTabIds.add(tid);
                        }
                    } else {
                        // Standard: Cache suggestion
                        for (const tabId of group.tabIds) {
                            if (!tabsData.find(t => t.id === tabId)) continue;

                            groupedTabIds.add(tabId);
                            await StateService.updateSuggestion({
                                tabId,
                                groupName: group.groupName,
                                existingGroupId: group.existingGroupId || null,
                                timestamp: now
                            });
                        }
                    }
                }

                // Cache negative results (tabs analyzed but not grouped)
                for (const tab of tabsData) {
                    if (!groupedTabIds.has(tab.id)) {
                        await StateService.updateSuggestion({
                            tabId: tab.id,
                            groupName: null,
                            existingGroupId: null,
                            timestamp: now
                        });
                    }
                    this.state.finish(tab.id);
                }
            }

            // Note: automated cache broadcast happens via StateService listener

        } catch (err) {
            console.error("[QueueProcessor] Processing error", err);
            for (const id of tabIds) this.state.finish(id);
        }
    }
}
