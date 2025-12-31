import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { SettingsStorage } from '../utils/storage';
import { DuplicateCloser } from '../services/duplicates';
import { debounce } from '../utils/debounce';
import { FeatureId } from '../types/features';

const DEBOUNCE_DELAY_MS = 1500;

export class TabManager {
    private debouncedProcess: () => void;
    private currentDebounceDelay: number;

    constructor(
        private processingState: ProcessingState,
        private queueProcessor: QueueProcessor,
        initialDelay: number = DEBOUNCE_DELAY_MS
    ) {
        this.currentDebounceDelay = initialDelay;
        // Initialize immediately to satisfy TS
        this.debouncedProcess = debounce(() => {
            this.queueAndProcess();
        }, this.currentDebounceDelay);
    }

    updateDebounceDelay(delay: number) {
        this.currentDebounceDelay = delay;
        // Create new debounce instance
        this.debouncedProcess = debounce(() => {
            this.queueAndProcess();
        }, this.currentDebounceDelay);
        console.log(`[TabManager] Updated debounce delay to ${delay}ms`);
    }

    /**
     * Trigger a check for new/ungrouped tabs
     */
    triggerRecalculation(reason: string) {
        console.log(`[TabManager] Triggering recalculation (${reason}) (debounced ${this.currentDebounceDelay}ms)`);
        this.debouncedProcess();
    }

    private async queueAndProcess() {
        const allTabs = await chrome.tabs.query({ windowType: chrome.tabs.WindowType.NORMAL });

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
            t.status !== chrome.tabs.TabStatus.LOADING &&
            !isEmptyNewTab(t.url) &&
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
            // Check global autopilot setting for Tab Grouper
            const settings = await SettingsStorage.get();
            // FIX: Use DuplicateCleaner for this check, as per original logic
            const autopilotEnabled = settings.features?.[FeatureId.DuplicateCleaner]?.autopilot ?? false;

            if (autopilotEnabled) {
                console.log(`[TabManager] Autopilot enabled for duplicate cleaning (tabId: ${tabId}).`);
                // We need the tab object to know the windowId, but handleTabUpdated only gives ID.
                // We'll query for the tab first.
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (tab.windowId) {
                        const result = await DuplicateCloser.closeDuplicatesInWindow(tab.windowId);
                        if (result.closedCount > 0) {
                            console.log(`[Autopilot] Closed ${result.closedCount} duplicate tabs.`);
                            // If we removed the current tab, stop processing
                            if (result.tabsRemoved.includes(tabId)) {
                                return;
                            }
                        }
                    }
                } catch (e) {
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
                this.triggerRecalculation(`Tab ${tabId} Ungrouped`);
            }
        }

        if (changeInfo.status === 'complete') {
            // Tab finished loading -> candidate for grouping
            this.triggerRecalculation(`Tab ${tabId} Updated (Complete)`);
        }
    }
}
