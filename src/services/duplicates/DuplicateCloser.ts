import { findDuplicates, getTabsToRemove } from './utils';
import { SettingsStorage, isFeatureAutopilot } from '../../utils/storage';
import { FeatureId } from '../../types/features';
import type { DeduplicateAction } from '../../types/suggestions';

export interface CloseResult {
    closedCount: number;
    tabsRemoved: number[];
    /** Deduplicate actions for undo; one per URL group closed. Callers record via StateService.pushDeduplicateAction. */
    actions: DeduplicateAction[];
}

/**
 * Service for closing duplicate tabs.
 * Can be used from both background script (autopilot) and sidepanel UI.
 */
export class DuplicateCloser {
    /**
     * Checks if the duplicate cleaner autopilot is enabled.
     */
    static async isAutopilotEnabled(): Promise<boolean> {
        const settings = await SettingsStorage.get();
        return isFeatureAutopilot(settings, FeatureId.DuplicateCleaner);
    }

    /**
     * Closes duplicate tabs in the specified window.
     * @param windowId - The window to check for duplicates. If undefined, uses current window.
     * @returns The result of the close operation, including count and tab IDs removed.
     */
    static async closeDuplicates(windowId?: number): Promise<CloseResult> {
        const queryOptions = windowId !== undefined ? { windowId } : { currentWindow: true };

        const tabs = await chrome.tabs.query(queryOptions);
        const urlMap = findDuplicates(tabs);
        const tabsToRemove = getTabsToRemove(urlMap);

        const actions: DeduplicateAction[] = [];
        for (const [url, group] of urlMap) {
            if (group.length > 1) {
                const windowId = group[0]?.windowId;
                const urls = group
                    .slice(1)
                    .map(t => t.url)
                    .filter((u): u is string => !!u);
                if (windowId !== undefined && urls.length > 0) {
                    actions.push({ type: 'deduplicate', windowId, url, urls });
                }
            }
        }

        if (tabsToRemove.length > 0) {
            await chrome.tabs.remove(tabsToRemove);
        }

        return {
            closedCount: tabsToRemove.length,
            tabsRemoved: tabsToRemove,
            actions
        };
    }

    /**
     * Closes duplicates for a specific window, commonly used from background autopilot.
     * Returns the removed tab IDs for caller to check if a specific tab was removed.
     */
    static async closeDuplicatesInWindow(windowId: number): Promise<CloseResult> {
        return this.closeDuplicates(windowId);
    }
}
