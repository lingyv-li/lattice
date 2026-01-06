/**
 * Checks if a URL is an empty new tab page.
 */
export const isEmptyNewTab = (url: string): boolean => {
    return (
        url === 'chrome://newtab/' ||
        url === 'chrome://new-tab-page/' ||
        url === 'about:blank' ||
        url === 'edge://newtab/'
    );
};

/**
 * Determines if a tab is suitable for group recommendation.
 * Filters out tabs without IDs/URLs/Titles, loading tabs, and empty new tabs.
 */
export function isGroupableTab(tab: chrome.tabs.Tab): boolean {
    if (!tab.id || !tab.url || !tab.title) {
        return false;
    }

    // Skip empty new tab pages - they have no meaningful content to group
    if (isEmptyNewTab(tab.url)) {
        return false;
    }

    // Skip tabs that are still actively loading to ensure titles are accurate
    if (tab.status === 'loading' && !tab.frozen) {
        return false;
    }

    // Skip tabs that are already grouped - we only want to suggest groups for ungrouped tabs
    if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
        return false;
    }

    return true;
};
