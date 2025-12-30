
import { ProcessingState } from './processing';
import { StateService } from './state';
import { AIService } from '../services/ai/AIService';
import { mapExistingGroups } from '../services/ai/shared';
import { getSettings } from '../utils/storage';
import { applyTabGroup } from '../utils/tabs';
import { computeInputHash } from '../utils/hash';

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

                // Capture input hashes for staleness detection
                const inputHashes = new Map<number, string>();
                for (const tab of tabs) {
                    inputHashes.set(tab.id!, computeInputHash(
                        { url: tab.url!, title: tab.title! },
                        existingGroupsData
                    ));
                }

                const settings = await getSettings();
                const provider = await AIService.getProvider(settings);
                const groupNameMap = mapExistingGroups(allGroups);

                const groups = await provider.generateSuggestions(
                    {
                        existingGroups: groupNameMap,
                        ungroupedTabs: tabsData,
                        customRules: settings.customGroupingRules
                    },
                    () => { }
                );

                const groupedTabIds = new Set<number>();

                // const settings = await getSettings(); // Already fetched above

                for (const group of groups) {
                    if (settings.autopilot) {
                        // Autopilot: Apply immediately and DO NOT cache
                        const validTabIds = group.tabIds.filter(id => tabsData.find(t => t.id === id));
                        if (validTabIds.length > 0) {
                            // Check staleness before applying
                            const currentGroups = await chrome.tabGroups.query({ windowId });
                            const currentGroupsData = currentGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

                            const freshTabIds: number[] = [];
                            for (const tid of validTabIds) {
                                const currentTab = await chrome.tabs.get(tid).catch(() => null);
                                if (!currentTab || !currentTab.url || !currentTab.title) continue;

                                const currentHash = computeInputHash(
                                    { url: currentTab.url, title: currentTab.title },
                                    currentGroupsData
                                );
                                if (currentHash === inputHashes.get(tid)) {
                                    freshTabIds.push(tid);
                                } else {
                                    console.log(`[QueueProcessor] Tab ${tid} stale, skipping autopilot`);
                                }
                            }

                            if (freshTabIds.length > 0) {
                                await applyTabGroup(
                                    freshTabIds,
                                    group.groupName,
                                    group.existingGroupId
                                );
                                for (const tid of freshTabIds) groupedTabIds.add(tid);
                            }
                        }
                    } else {
                        // Standard: Cache suggestion (with staleness check)
                        for (const tabId of group.tabIds) {
                            const currentTab = await chrome.tabs.get(tabId).catch(() => null);
                            if (!currentTab || !currentTab.url || !currentTab.title) continue;

                            const currentGroups = await chrome.tabGroups.query({ windowId });
                            const currentGroupsData = currentGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));
                            const currentHash = computeInputHash(
                                { url: currentTab.url, title: currentTab.title },
                                currentGroupsData
                            );

                            if (currentHash !== inputHashes.get(tabId)) {
                                console.log(`[QueueProcessor] Tab ${tabId} stale, discarding result`);
                                continue;
                            }

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

                // Also cache negative results (tabs analyzed but not grouped) - with staleness check
                for (const tab of tabsData) {
                    if (!groupedTabIds.has(tab.id)) {
                        const currentTab = await chrome.tabs.get(tab.id).catch(() => null);
                        if (!currentTab || !currentTab.url || !currentTab.title) {
                            this.state.finish(tab.id);
                            continue;
                        }

                        const currentGroups = await chrome.tabGroups.query({ windowId });
                        const currentGroupsData = currentGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));
                        const currentHash = computeInputHash(
                            { url: currentTab.url, title: currentTab.title },
                            currentGroupsData
                        );

                        if (currentHash !== inputHashes.get(tab.id)) {
                            console.log(`[QueueProcessor] Tab ${tab.id} stale, discarding negative result`);
                            this.state.finish(tab.id);
                            continue;
                        }

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
