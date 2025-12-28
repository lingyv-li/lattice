import { initializeDownloadMonitor } from '../utils/downloadMonitor';
import { generateTabGroupSuggestions } from '../utils/ai';

import { TabGroupResponse, TabSuggestionCache } from '../types/tabGrouper';

console.log("Background Service Worker Initialized");
console.log("AI Availability:", self.LanguageModel ? "Available" : "Not Available");

// ===== CACHE SYSTEM =====
// Per-tab suggestion cache
const suggestionCache = new Map<number, TabSuggestionCache>();

// Track existing groups to detect changes
// Track existing groups for cache invalidation (stored in invalidateCache)

// Processing queue (tabs waiting to be processed)
const processingQueue = new Set<number>();
const currentlyProcessing = new Set<number>();

// Debounce timer for batch processing
let processDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const PROCESS_DEBOUNCE_MS = 1000;

// Connected ports for sending cache updates
const connectedPorts = new Set<chrome.runtime.Port>();

// Rejected tabs (will be re-processed on next cache invalidation)
const rejectedTabs = new Set<number>();

// ===== CACHE INVALIDATION =====
const invalidateCache = async () => {
    console.log("[TabGrouper] Invalidating cache due to group change");
    suggestionCache.clear();
    rejectedTabs.clear();

    // Update known groups (logged for debugging)
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    console.log("[TabGrouper] Current groups:", groups.length);

    // Re-queue all ungrouped tabs
    await queueUngroupedTabs();

    // Notify connected ports
    broadcastCacheUpdate();
};

const broadcastCacheUpdate = () => {
    const response: TabGroupResponse = {
        type: 'CACHED_SUGGESTIONS',
        cachedSuggestions: Array.from(suggestionCache.values()),
        processingTabIds: [...processingQueue, ...currentlyProcessing]
    };

    for (const port of connectedPorts) {
        try {
            port.postMessage(response);
        } catch (e) {
            // Port disconnected
            connectedPorts.delete(port);
        }
    }
};

// ===== BACKGROUND PROCESSING =====
const queueUngroupedTabs = async () => {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const ungroupedTabs = allTabs.filter(t =>
        t.groupId === chrome.tabs.TAB_ID_NONE &&
        t.id &&
        t.url &&
        t.title &&
        !suggestionCache.has(t.id) &&
        !currentlyProcessing.has(t.id) &&
        !rejectedTabs.has(t.id)
    );

    for (const tab of ungroupedTabs) {
        if (tab.id) {
            processingQueue.add(tab.id);
        }
    }

    scheduleProcessing();
};

const scheduleProcessing = () => {
    if (processDebounceTimer) {
        clearTimeout(processDebounceTimer);
    }

    processDebounceTimer = setTimeout(processQueue, PROCESS_DEBOUNCE_MS);
};

const processQueue = async () => {
    if (processingQueue.size === 0) return;
    if (!self.LanguageModel) return;

    const availability = await self.LanguageModel.availability();
    if (availability === 'unavailable') return;

    // Get tabs to process
    const tabIds = Array.from(processingQueue);
    processingQueue.clear();

    // Move to currently processing
    for (const id of tabIds) {
        currentlyProcessing.add(id);
    }

    broadcastCacheUpdate();

    try {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

        // Include virtual groups from cache
        const virtualGroups = new Map<string, { id: number; title: string }>();
        let nextVirtualId = -1;

        for (const cached of suggestionCache.values()) {
            if (cached.existingGroupId === null) {
                if (!virtualGroups.has(cached.groupName)) {
                    virtualGroups.set(cached.groupName, { id: nextVirtualId--, title: cached.groupName });
                }
            }
        }

        const allGroups = [...existingGroupsData, ...virtualGroups.values()];

        // Get tab data for tabs we're processing
        const tabsToProcess = allTabs
            .filter(t => t.id && tabIds.includes(t.id) && t.url && t.title)
            .map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

        if (tabsToProcess.length === 0) {
            currentlyProcessing.clear();
            return;
        }

        const groups = await generateTabGroupSuggestions(
            {
                existingGroups: allGroups,
                ungroupedTabs: tabsToProcess
            },
            () => { }, // No progress callback for background
            () => { }  // No session callback for background
        );

        // Store results in cache
        const now = Date.now();
        for (const group of groups) {
            for (const tabId of group.tabIds) {
                suggestionCache.set(tabId, {
                    tabId,
                    groupName: group.groupName,
                    existingGroupId: group.existingGroupId || null,
                    timestamp: now
                });
                currentlyProcessing.delete(tabId);
            }
        }

        broadcastCacheUpdate();

    } catch (err) {
        console.error("[TabGrouper] Background processing error:", err);
        currentlyProcessing.clear();
    }
};

// ===== TAB EVENT LISTENERS =====
chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id && tab.groupId === chrome.tabs.TAB_ID_NONE) {
        // Wait a bit for the tab to fully load
        setTimeout(() => {
            if (tab.id && !suggestionCache.has(tab.id)) {
                processingQueue.add(tab.id);
                scheduleProcessing();
            }
        }, 2000);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // If URL changed, invalidate cache for this tab
    if (changeInfo.url) {
        suggestionCache.delete(tabId);
        rejectedTabs.delete(tabId);
        broadcastCacheUpdate();
    }

    // If tab became ungrouped or URL changed, queue for processing
    if (changeInfo.groupId === chrome.tabs.TAB_ID_NONE || changeInfo.url) {
        if (tab.groupId === chrome.tabs.TAB_ID_NONE && !suggestionCache.has(tabId)) {
            processingQueue.add(tabId);
            scheduleProcessing();
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    suggestionCache.delete(tabId);
    processingQueue.delete(tabId);
    currentlyProcessing.delete(tabId);
    broadcastCacheUpdate();
});

// ===== TAB GROUP CHANGE LISTENERS =====
chrome.tabGroups.onCreated.addListener(() => invalidateCache());
chrome.tabGroups.onRemoved.addListener(() => invalidateCache());
chrome.tabGroups.onUpdated.addListener(() => invalidateCache());

// ===== PORT CONNECTIONS =====
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tab-grouper') return;

    connectedPorts.add(port);

    port.onDisconnect.addListener(() => {
        connectedPorts.delete(port);
    });

    port.onMessage.addListener(async (msg) => {
        if (msg.type === 'GET_CACHED_SUGGESTIONS') {
            // Return current cache
            port.postMessage({
                type: 'CACHED_SUGGESTIONS',
                cachedSuggestions: Array.from(suggestionCache.values()),
                processingTabIds: [...processingQueue, ...currentlyProcessing]
            } as TabGroupResponse);

            // Also trigger background processing if there are ungrouped tabs not in cache
            await queueUngroupedTabs();
        }

        if (msg.type === 'REJECT_SUGGESTIONS' && msg.rejectedTabIds) {
            // Remove rejected tabs from cache and add to rejected set
            for (const tabId of msg.rejectedTabIds) {
                suggestionCache.delete(tabId);
                rejectedTabs.add(tabId);
            }
            console.log("[TabGrouper] Rejected tabs:", msg.rejectedTabIds);
            broadcastCacheUpdate();
        }

        if (msg.type === 'START_GROUPING') {
            try {
                if (!self.LanguageModel) {
                    port.postMessage({ type: 'ERROR', error: "AI API not supported in this browser." } as TabGroupResponse);
                    return;
                }

                const availability = await self.LanguageModel.availability();
                if (availability === 'unavailable') {
                    port.postMessage({ type: 'ERROR', error: "AI model is not available." } as TabGroupResponse);
                    return;
                }

                const allTabs = await chrome.tabs.query({ currentWindow: true });
                const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
                const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));
                const ungroupedTabs = allTabs.filter(t => t.groupId === chrome.tabs.TAB_ID_NONE);
                const tabData = ungroupedTabs
                    .filter(t => t.id && t.url && t.title)
                    .map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

                if (tabData.length === 0) {
                    port.postMessage({ type: 'ERROR', error: "No ungrouped tabs found." } as TabGroupResponse);
                    return;
                }

                // Clear cache for regeneration
                suggestionCache.clear();

                const groups = await generateTabGroupSuggestions(
                    {
                        existingGroups: existingGroupsData,
                        ungroupedTabs: tabData
                    },
                    (progress) => {
                        port.postMessage({ type: 'PROGRESS', value: progress } as TabGroupResponse);
                    },
                    () => {
                        port.postMessage({ type: 'SESSION_CREATED' } as TabGroupResponse);
                    }
                );

                // Update cache with new results
                const now = Date.now();
                for (const group of groups) {
                    for (const tabId of group.tabIds) {
                        suggestionCache.set(tabId, {
                            tabId,
                            groupName: group.groupName,
                            existingGroupId: group.existingGroupId || null,
                            timestamp: now
                        });
                    }
                }

                port.postMessage({ type: 'COMPLETE', groups } as TabGroupResponse);

            } catch (err: any) {
                console.error(err);
                port.postMessage({ type: 'ERROR', error: err.message || "An error occurred." } as TabGroupResponse);
            }
        }
    });
});


// Track side panel open state per window
const sidePanelOpenState = new Map<number, boolean>();

// Toggle side panel on action click
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.windowId) return;

    const isOpen = sidePanelOpenState.get(tab.windowId) ?? false;
    try {
        if (isOpen) {
            // Close by disabling for this tab
            await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
            // Re-enable for future use
            await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
            sidePanelOpenState.set(tab.windowId, false);
        } else {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            sidePanelOpenState.set(tab.windowId, true);
        }
    } catch (error) {
        console.error("[SidePanel] Failed to toggle side panel:", error);
    }
});

// Initialize download monitoring
initializeDownloadMonitor();

// Initial queue of ungrouped tabs (on service worker start)
// Defer this to avoid blocking initial setup
setTimeout(() => queueUngroupedTabs(), 500);
