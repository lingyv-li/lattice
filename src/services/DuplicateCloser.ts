import { findDuplicates, getTabsToRemove } from '../utils/duplicates';

export interface CloseResult {
    closedCount: number;
    tabsRemoved: number[];
}

/**
 * Service for closing duplicate tabs.
 * Can be used from both background script (autopilot) and sidepanel UI.
 */
export class DuplicateCloser {
    /**
     * Closes duplicate tabs in the specified window.
     * @param windowId - The window to check for duplicates. If undefined, uses current window.
     * @returns The result of the close operation, including count and tab IDs removed.
     */
    static async closeDuplicates(windowId?: number): Promise<CloseResult> {
        const queryOptions = windowId !== undefined
            ? { windowId }
            : { currentWindow: true };

        const tabs = await chrome.tabs.query(queryOptions);
        const urlMap = findDuplicates(tabs);
        const tabsToRemove = getTabsToRemove(urlMap);

        if (tabsToRemove.length > 0) {
            await chrome.tabs.remove(tabsToRemove);
        }

        return {
            closedCount: tabsToRemove.length,
            tabsRemoved: tabsToRemove
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
