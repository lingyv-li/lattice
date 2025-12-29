
import { ProcessingState } from './processing';
import { StateService } from './state';
import { generateTabGroupSuggestions } from '../utils/ai';

export class QueueProcessor {
    constructor(private state: ProcessingState) { }

    async process(): Promise<void> {
        if (this.state.size === 0) return;

        // AI Check
        // @ts-ignore - separate declaration for Service Worker globals usually needed
        if (!self.LanguageModel) return;
        try {
            // @ts-ignore
            const availability = await self.LanguageModel.availability();
            if (availability === 'unavailable') return;
        } catch (e) {
            return;
        }

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

                const groups = await generateTabGroupSuggestions(
                    {
                        existingGroups: allGroups,
                        ungroupedTabs: tabsData
                    },
                    () => { },
                    () => { }
                );

                const groupedTabIds = new Set<number>();
                for (const group of groups) {
                    for (const tabId of group.tabIds) {
                        groupedTabIds.add(tabId);
                        await StateService.updateSuggestion({
                            tabId,
                            groupName: group.groupName,
                            existingGroupId: group.existingGroupId || null,
                            timestamp: now
                        });
                    }
                }

                // Also cache negative results (tabs analyzed but not grouped)
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
