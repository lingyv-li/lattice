import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { SettingsStorage } from '../utils/storage';
import { DuplicateCloser } from '../services/duplicates';
import { debounce } from '../utils/debounce';
import { FeatureId } from '../types/features';

const DEBOUNCE_DELAY_MS = 1500;

export class TabManager {
    constructor(
        private processingState: ProcessingState,
        private queueProcessor: QueueProcessor
    ) { }

    /**
     * Trigger a check for new/ungrouped tabs
     */
    triggerRecalculation = debounce((reason: string) => {
        console.log(`[TabManager] Triggering recalculation (${reason}) (debounced ${DEBOUNCE_DELAY_MS}ms)`);
        this.queueAndProcess();
    }, DEBOUNCE_DELAY_MS);

    private async queueAndProcess() {
        const settings = await SettingsStorage.get();
        if (!settings.features?.[FeatureId.TabGrouper]?.enabled) {
            console.log("[TabManager] Tab Grouper is disabled, skipping processing");
            return;
        }

        // Get all normal windows
        const allWindows = await chrome.windows.getAll({ windowTypes: [chrome.windows.WindowType.NORMAL] });
        const windowIds = allWindows.map(w => w.id!).filter(id => id !== undefined);

        for (const windowId of windowIds) {
            // Check if window state has changed (fetches snapshot internally)
            const changed = await this.processingState.isWindowChanged(windowId);

            if (!changed) {
                console.log(`[TabManager] Skipping window ${windowId}: No changes since last successful processing.`);
                continue;
            }

            // Queue for processing - QueueProcessor handles the "no ungrouped tabs" case
            console.log(`[TabManager] Window ${windowId} has changes, queuing.`);
            await this.processingState.add(windowId, false);
        }

        // Process immediately if we have windows queued in ProcessingState
        if (this.processingState.hasItems) {
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
