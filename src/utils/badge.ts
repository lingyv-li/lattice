
export const calculateDuplicateCount = async (windowId?: number) => {
    try {
        const query: chrome.tabs.QueryInfo = {};
        if (windowId) query.windowId = windowId;

        const tabs = await chrome.tabs.query(query);
        const urlMap = new Map<string, number>();
        let duplicateCount = 0;

        for (const tab of tabs) {
            if (!tab.url) continue;
            const normalizedUrl = tab.url.replace(/\/$/, '');
            const count = urlMap.get(normalizedUrl) || 0;
            if (count > 0) {
                duplicateCount++;
            }
            urlMap.set(normalizedUrl, count + 1);
        }
        return duplicateCount;
    } catch (e) {
        console.error("[Badge] Failed to calculate duplicates:", e);
        return 0;
    }
};

export const updateWindowBadge = async (windowId: number, isProcessing: boolean, groupCount: number, hasError: boolean) => {
    // Get active tab for this window to set badge on (closest we can get to per-window badge)
    let activeTabId: number | undefined;
    try {
        const [activeTab] = await chrome.tabs.query({ windowId, active: true });
        activeTabId = activeTab?.id;
    } catch (e) {
        // Window might be closed
        return;
    }

    if (!activeTabId) return;

    if (hasError) {
        await chrome.action.setBadgeText({ text: "ERR", tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#D93025", tabId: activeTabId }); // Google Red
        return;
    }

    if (isProcessing) {
        await chrome.action.setBadgeText({ text: "...", tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#A855F7", tabId: activeTabId }); // Purple-500
        return;
    }

    // Calculate duplicates for this window
    const duplicateCount = await calculateDuplicateCount(windowId);

    const totalCount = groupCount + duplicateCount;

    if (totalCount > 0) {
        await chrome.action.setBadgeText({ text: totalCount.toString(), tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#22C55E", tabId: activeTabId }); // Green-500
    } else {
        await chrome.action.setBadgeText({ text: "", tabId: activeTabId });
    }
};
