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
        const settings = await SettingsStorage.get();
        if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
            console.log("[TabManager] Tab Grouper is disabled, skipping processing");
            return;
        }

        const ungroupedTabs = await chrome.tabs.query({
            windowType: chrome.tabs.WindowType.NORMAL,
            groupId: chrome.tabs.TAB_ID_NONE
        });

        const windowIdsToProcess = new Set<number>();
        for (const tab of ungroupedTabs) {
            windowIdsToProcess.add(tab.windowId);
        }

        for (const windowId of windowIdsToProcess) {
            this.processingState.add(windowId);
        }

        // Process immediately if we have windows queued
        if (windowIdsToProcess.size > 0) {
            console.log("[TabManager] Processing queued windows");
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
