export const updateWindowBadge = async (windowId: number, isProcessing: boolean, groupCount: number, duplicateCount: number, hasError: boolean, customText?: string, customColor?: string) => {
    // Get active tab for this window to set badge on (closest we can get to per-window badge)
    let activeTabId: number | undefined;
    try {
        const [activeTab] = await chrome.tabs.query({ windowId, active: true });
        activeTabId = activeTab?.id;
    } catch {
        // Window might be closed
        return;
    }

    if (!activeTabId) return;

    // Custom badge (e.g., configuration warning)
    if (customText && customColor) {
        await chrome.action.setBadgeText({ text: customText, tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: customColor, tabId: activeTabId });
        return;
    }

    if (hasError) {
        await chrome.action.setBadgeText({ text: 'ERR', tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: '#D93025', tabId: activeTabId }); // Google Red
        return;
    }

    if (isProcessing) {
        await chrome.action.setBadgeText({ text: '...', tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: '#A855F7', tabId: activeTabId }); // Purple-500
        return;
    }

    const totalCount = groupCount + duplicateCount;

    if (totalCount > 0) {
        await chrome.action.setBadgeText({ text: totalCount.toString(), tabId: activeTabId });
        await chrome.action.setBadgeBackgroundColor({ color: '#22C55E', tabId: activeTabId }); // Green-500
    } else {
        await chrome.action.setBadgeText({ text: '', tabId: activeTabId });
    }
};
