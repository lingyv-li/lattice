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

        // Get all normal windows and their tabs/groups
        const [allTabs, allGroups] = await Promise.all([
            chrome.tabs.query({ windowType: chrome.windows.WindowType.NORMAL }),
            chrome.tabGroups.query({})
        ]);


        // Group tabs and groups by windowId
        const tabsByWindow = new Map<number, chrome.tabs.Tab[]>();
        const groupsByWindow = new Map<number, chrome.tabGroups.TabGroup[]>();

        for (const tab of allTabs) {
            if (!tabsByWindow.has(tab.windowId)) tabsByWindow.set(tab.windowId, []);
            tabsByWindow.get(tab.windowId)!.push(tab);
        }
        for (const group of allGroups) {
            if (!groupsByWindow.has(group.windowId)) groupsByWindow.set(group.windowId, []);
            groupsByWindow.get(group.windowId)!.push(group);
        }

        // Iterate through unique windows
        const uniqueWindowIds = new Set([...tabsByWindow.keys(), ...groupsByWindow.keys()]);

        for (const windowId of uniqueWindowIds) {
            const tabs = tabsByWindow.get(windowId) || [];
            const groups = groupsByWindow.get(windowId) || [];

            // 2. Compare with last processed successful snapshot via ProcessingState
            const isChanged = await this.processingState.isWindowChanged(windowId, tabs, groups);

            if (!isChanged) {
                console.log(`[TabManager] Skipping window ${windowId}: No changes since last successful processing.`);
                continue;
            }

            // 3. Only queue if there are actually ungrouped tabs (optional but good for efficiency)
            const hasUngroupedTabs = tabs.some(t => t.groupId === chrome.tabs.TAB_ID_NONE);
            if (!hasUngroupedTabs) {
                // If everything is already grouped, we should still record the snapshot 
                // so we don't re-check until someone ungroups or moves something.
                await this.processingState.completeWindow(windowId, tabs, groups);
                continue;
            }

            console.log(`[TabManager] Window ${windowId} has changes, queuing.`);
            this.processingState.add(windowId);
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
