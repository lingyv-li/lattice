
import { StateService } from './state';
import { ProcessingState } from './processing';

const PROCESS_TABS_ALARM_NAME = 'process_tabs_alarm';
const PROCESS_DELAY_MS = 1000;

export class TabManager {
    constructor(private processingState: ProcessingState) { }

    async invalidateCache() {
        console.log("[TabManager] Invalidating cache due to group change");
        await StateService.clearCache();
        // Re-queue
        await this.queueUngroupedTabs();
    }

    async queueUngroupedTabs(windowId?: number) {
        const queryInfo: chrome.tabs.QueryInfo = { windowType: chrome.tabs.WindowType.NORMAL };
        if (windowId) queryInfo.windowId = windowId;

        const allTabs = await chrome.tabs.query(queryInfo);
        const cache = await StateService.getSuggestionCache();

        // Filter out tabs that are already grouped, cached, or processing
        const tabsToProcess = allTabs.filter(t =>
            t.groupId === chrome.tabs.TAB_ID_NONE &&
            t.id &&
            t.url &&
            t.title &&
            t.status === 'complete' && // Only process loaded tabs
            !cache.has(t.id) &&
            !this.processingState.has(t.id)
        );

        let added = false;
        for (const tab of tabsToProcess) {
            if (tab.id && this.processingState.add(tab.id)) {
                added = true;
            }
        }

        if (added || this.processingState.size > 0) {
            this.scheduleProcessing();
        }
    }

    scheduleProcessing() {
        console.log("[TabManager] Scheduling processing alarm");
        chrome.alarms.create(PROCESS_TABS_ALARM_NAME, { when: Date.now() + PROCESS_DELAY_MS });
    }

    async handleTabUpdated(tabId: number, changeInfo: any) {
        if (changeInfo.url) {
            // URL changed: invalidate old cache for this tab
            await StateService.removeSuggestion(tabId);
        }

        if (changeInfo.groupId !== undefined) {
            // Group changed: User manual action or auto-grouping applied
            // Invalidate suggestion for this tab as state changed
            await StateService.removeSuggestion(tabId);

            if (changeInfo.groupId === chrome.tabs.TAB_ID_NONE) {
                // Tab was ungrouped -> candidate for re-grouping
                await this.queueUngroupedTabs();
            }
        }

        if (changeInfo.status === 'complete') {
            // Tab finished loading -> candidate for grouping
            await this.queueUngroupedTabs();
        }
    }
}
