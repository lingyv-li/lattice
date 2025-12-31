
import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { getSettings } from '../utils/storage';
import { findDuplicates, getTabsToRemove } from '../utils/duplicates';
import { debounce } from '../utils/debounce';

const DEBOUNCE_DELAY_MS = 1500;

export class TabManager {
    private debouncedProcess: () => void;

    constructor(
        private processingState: ProcessingState,
        private queueProcessor: QueueProcessor
    ) {
        this.debouncedProcess = debounce(() => {
            this.queueAndProcess();
        }, DEBOUNCE_DELAY_MS);
    }

    /**
     * Single entry point for triggering tab recalculation.
     * Uses setTimeout debounce - safe for sub-30-second delays while service worker is active.
     */
    triggerRecalculation() {
        console.log("[TabManager] Triggering recalculation (debounced)");
        this.debouncedProcess();
    }

    private async queueAndProcess() {
        const allTabs = await chrome.tabs.query({ windowType: chrome.tabs.WindowType.NORMAL });
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
            t.status === 'complete' &&
            !isEmptyNewTab(t.url) &&
            !cache.has(t.id) &&
            !this.processingState.has(t.id)
        );

        for (const tab of tabsToProcess) {
            if (tab.id) {
                this.processingState.add(tab.id);
            }
        }

        // Process immediately if we have tabs queued
        if (tabsToProcess.length > 0) {
            console.log("[TabManager] Processing queued tabs");
            await this.queueProcessor.process();
        }
    }

    async handleTabUpdated(tabId: number, changeInfo: { url?: string; status?: string; groupId?: number }) {
        // Autopilot: close duplicates when a tab navigates or finishes loading
        if (changeInfo.url || changeInfo.status === 'complete') {
            // Check for Autopilot duplicate cleaning
            const settings = await getSettings();
            if (settings.autopilot?.['duplicate-cleaner']) {
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
            // Group changed: invalidate suggestion as state changed
            await StateService.removeSuggestion(tabId);
            if (changeInfo.groupId === chrome.tabs.TAB_ID_NONE) {
                // Tab was ungrouped -> candidate for re-grouping
                this.triggerRecalculation();
            }
        }

        if (changeInfo.status === 'complete') {
            // Tab finished loading -> candidate for grouping
            this.triggerRecalculation();
        }
    }
}
