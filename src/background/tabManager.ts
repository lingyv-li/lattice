import { StateService } from './state';
import { WindowSnapshot } from '../utils/snapshots';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { SettingsStorage, isTabGrouperEnabled } from '../utils/storage';
import { DuplicateCloser, findDuplicates, countDuplicates } from '../services/duplicates';
import { debounce } from '../utils/debounce';

const DEBOUNCE_DELAY_MS = 1500;

export class TabManager {
    constructor(
        private processingState: ProcessingState,
        private queueProcessor: QueueProcessor
    ) {
        // Listen to group changes as they are fatal to current AI context

        chrome.tabGroups.onUpdated.addListener(() => this.triggerRecalculation('Group Updated'));
        chrome.tabGroups.onCreated.addListener(() => this.triggerRecalculation('Group Created'));
        chrome.tabGroups.onRemoved.addListener(() => this.triggerRecalculation('Group Removed'));

        // Tab creation/removal also needs to trigger recalc (though potentially benign)

        chrome.tabs.onCreated.addListener(async tab => {
            // If tab is not complete, triggerRecalculation will handle it via debounce.
            if (tab.status !== 'loading') {
                this.triggerRecalculation(`Tab Created ${tab.id}`);
            }
        });
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
            try {
                await this.handleTabUpdated(tabId, changeInfo);
            } catch (err) {
                console.error(`[TabManager] Error handling tab update for tab ${tabId}:`, err);
            }
        });
        chrome.tabs.onRemoved.addListener(async tabId => {
            try {
                await StateService.removeSuggestion(tabId);
            } catch (err) {
                console.error(`[TabManager] Error removing suggestion for tab ${tabId}:`, err);
            }
            this.triggerRecalculation('Tab Removed');
        });

        chrome.windows.onRemoved.addListener(windowId => {
            // console.log(`[TabManager] Window ${windowId} closed. Removing from processing state.`);
            this.processingState.remove(windowId);
        });
    }

    /**
     * Trigger a check for new/ungrouped tabs
     */
    triggerRecalculation = debounce((reason: string) => {
        console.log(`[TabManager] Triggering recalculation (${reason}) (debounced ${DEBOUNCE_DELAY_MS}ms)`);
        this.queueAndProcess();
    }, DEBOUNCE_DELAY_MS);

    async queueAndProcess() {
        const settings = await SettingsStorage.get();
        if (!isTabGrouperEnabled(settings)) {
            console.log('[TabManager] Tab Grouper is disabled, skipping processing');
            return;
        }

        // Efficiently get snapshots for all NORMAL windows
        const snapshots = await WindowSnapshot.fetchAll({
            windowTypes: [chrome.windows.WindowType.NORMAL]
        });

        for (const [windowId, currentSnapshot] of snapshots) {
            // Calculate and update duplicates regardless of whether we process AI
            const duplicatesMap = findDuplicates(currentSnapshot.all);
            const duplicateCount = countDuplicates(duplicatesMap);
            await StateService.updateDuplicateCount(windowId, duplicateCount);

            const lastPersistent = await StateService.getWindowSnapshot(windowId);

            if (!currentSnapshot.equals(lastPersistent)) {
                // Window changed!
                console.log(`[TabManager] Window ${windowId} changed (Tabs: ${currentSnapshot.tabCount})`);

                // Check if we actually need to analyze
                if (currentSnapshot.tabCount > 0) {
                    console.log(`[TabManager] Enqueuing window ${windowId} for analysis.`);
                    await this.processingState.enqueue(windowId, currentSnapshot, false);
                } else {
                    console.log(`[TabManager] Window ${windowId} has no ungrouped tabs. Marking as Organized (skipping analysis).`);
                    // We must manually update storage here since we are NOT enqueuing
                    await this.processingState.updateKnownState(windowId, currentSnapshot);
                }
            } else {
                console.log(`[TabManager] Skipping window ${windowId}: No changes since last successful processing.`);
            }
        }

        // Process immediately if we have windows queued in ProcessingState
        if (this.processingState.hasItems) {
            console.log('[TabManager] Processing queued windows');
            await this.queueProcessor.process();
        }
    }

    async handleTabUpdated(tabId: number, changeInfo: { url?: string; status?: string; groupId?: number }) {
        // Autopilot: close duplicates when a tab navigates or finishes loading
        if (changeInfo.url || changeInfo.status === 'complete') {
            // Check global autopilot setting for Duplicate Cleaner
            const autopilotEnabled = await DuplicateCloser.isAutopilotEnabled();

            if (autopilotEnabled) {
                console.log(`[TabManager] Autopilot enabled for duplicate cleaning (tabId: ${tabId}).`);
                // We need the tab object to know the windowId, but handleTabUpdated only gives ID.
                // We'll query for the tab first.
                try {
                    const tab = await chrome.tabs.get(tabId);
                    if (tab.windowId) {
                        const result = await DuplicateCloser.closeDuplicatesInWindow(tab.windowId);
                        if (result.closedCount > 0) {
                            for (const a of result.actions) {
                                await StateService.pushDeduplicateAction(a);
                            }
                            console.log(`[Autopilot] Closed ${result.closedCount} duplicate tabs.`);
                            // If we removed the current tab, stop processing
                            if (result.tabsRemoved.includes(tabId)) {
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.error('[TabManager] Error checking duplicates:', e);
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
