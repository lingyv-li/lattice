/**
 * Shared utility for detecting and cleaning duplicate tabs.
 */

/**
 * Finds duplicate tabs grouped by normalized URL.
 * Returns a map where key is URL and value is list of tabs with that URL.
 */
export const findDuplicates = (tabs: chrome.tabs.Tab[]): Map<string, chrome.tabs.Tab[]> => {
    const urlMap = new Map<string, chrome.tabs.Tab[]>();

    tabs.forEach(tab => {
        if (!tab.url) return;
        // Normalize URL (strip trailing slash)
        const normalizedUrl = tab.url.replace(/\/$/, '');
        const group = urlMap.get(normalizedUrl) || [];
        group.push(tab);
        urlMap.set(normalizedUrl, group);
    });

    return urlMap;
};

/**
 * Calculates the total number of duplicate tabs that can be closed.
 */
export const countDuplicates = (urlMap: Map<string, chrome.tabs.Tab[]>): number => {
    let count = 0;
    urlMap.forEach(group => {
        if (group.length > 1) {
            count += group.length - 1;
        }
    });
    return count;
};

/**
 * Identifies which tabs should be closed to remove duplicates.
 * Heuristic: Keep Pinned > Keep Active > Keep Oldest (lowest ID).
 */
export const getTabsToRemove = (urlMap: Map<string, chrome.tabs.Tab[]>): number[] => {
    const tabsToRemove: number[] = [];

    urlMap.forEach(group => {
        if (group.length > 1) {
            // Sort to find the one to KEEP (which will be at index 0)
            // Criteria for determining the BEST tab to KEEP:
            // 1. Pinned (Pinned comes first)
            // 2. Active (Active comes first)
            // 3. Oldest (Lowest ID comes first)
            group.sort((a, b) => {
                // Pinned check: pinned tabs should be kept (sorted earlier)
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

                // Active check: active tab should be kept
                if (a.active !== b.active) return a.active ? -1 : 1;

                // ID check: lower ID means older tab, usually we keep oldest
                return (a.id || 0) - (b.id || 0);
            });

            // The first item (index 0) is the one we KEEP.
            // The rest are duplicates to remove.
            const duplicates = group.slice(1);
            duplicates.forEach(d => {
                if (d.id) tabsToRemove.push(d.id);
            });
        }
    });

    return tabsToRemove;
};
