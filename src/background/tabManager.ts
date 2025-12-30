
import { StateService } from './state';
import { ProcessingState } from './processing';
import { getSettings } from '../utils/storage';
import { findDuplicates, getTabsToRemove } from '../utils/duplicates';

const PROCESS_TABS_ALARM_NAME = 'process_tabs_alarm';
const PROCESS_DELAY_MS = 1000;

export class TabManager {
    constructor(private processingState: ProcessingState) { }

    async onGroupsChanged() {
        console.log("[TabManager] Groups changed, triggering reanalysis");
        // Staleness is handled per-tab via hash - just re-queue for processing
        await this.queueUngroupedTabs(undefined, { forceReprocess: true });
    }

    async queueUngroupedTabs(windowId?: number, options?: { forceReprocess?: boolean }) {
        const queryInfo: chrome.tabs.QueryInfo = { windowType: chrome.tabs.WindowType.NORMAL };
        if (windowId) queryInfo.windowId = windowId;

        const allTabs = await chrome.tabs.query(queryInfo);
        const cache = await StateService.getSuggestionCache();

        // Skip empty new tab pages - they have no meaningful content to group
        const isEmptyNewTab = (url: string) =>
            url === 'chrome://newtab/' ||
            url === 'chrome://new-tab-page/' ||
            url === 'about:blank' ||
            url === 'edge://newtab/';

        // Filter out tabs that are already grouped, cached, processing, or empty new tabs
        const tabsToProcess = allTabs.filter(t =>
            t.groupId === chrome.tabs.TAB_ID_NONE &&
            t.id &&
            t.url &&
            t.title &&
            t.status === 'complete' && // Only process loaded tabs
            !isEmptyNewTab(t.url) && // Skip empty new tabs
            (options?.forceReprocess || !cache.has(t.id)) &&
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
        if (changeInfo.url || changeInfo.status === 'complete') {
            // Check for Autopilot duplicate cleaning
            const settings = await getSettings();
            if (settings.autopilot) {
                // Scope to the window of the updated tab? 
                // We need the tab object to know the windowId, but handleTabUpdated only gives ID.
                // We'll query for the tab first.
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (tab.windowId) {
                        const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
                        const urlMap = findDuplicates(windowTabs);
                        const tabsToRemove = getTabsToRemove(urlMap);

                        // Prevent removing the recently updated tab if it's the one we want to keep?
                        // getTabsToRemove heuristics already handle keeping active/oldest.
                        // But if we JUST navigated, this tab might be "active".

                        if (tabsToRemove.length > 0) {
                            console.log(`[Autopilot] Closing ${tabsToRemove.length} duplicate tabs.`);
                            await chrome.tabs.remove(tabsToRemove);
                            // If we removed the current tab (unlikely due to heuristic), we stop processing?
                            if (tabsToRemove.includes(tabId)) {
                                return; // Tab is gone, no need to process
                            }
                        }
                    }
                } catch (e) {
                    // Tab might be gone or error
                    console.error("[TabManager] Error checking duplicates:", e);
                }
            }
        }

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
