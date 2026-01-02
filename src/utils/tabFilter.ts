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
export const isGroupableTab = (tab: chrome.tabs.Tab): boolean => {
    if (!tab.id || !tab.url || !tab.title) {
        return false;
    }

    // Skip empty new tab pages - they have no meaningful content to group
    if (isEmptyNewTab(tab.url)) {
        return false;
    }

    // Skip tabs that are still actively loading to ensure titles are accurate
    if (tab.status === 'loading' && !tab.frozen) { // Using string literal as enum depends on runtime chrome
        return false;
    }

    return true;
};
