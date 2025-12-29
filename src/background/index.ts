import { generateTabGroupSuggestions } from '../utils/ai';
import { StorageManager } from '../utils/storage';
import { TabGroupResponse, TabSuggestionCache } from '../types/tabGrouper';

console.log("[Background] Service Worker Initialized");

// ===== CONSTANTS =====
const ALARM_NAME = 'process_tabs_alarm';
const PROCESS_DELAY_MS = 1000; // Wait 1s after last event before processing

// ===== STATE =====
// In-memory state, hydrated from storage
let suggestionCache = new Map<number, TabSuggestionCache>();
let rejectedTabs = new Set<number>();
let isStateHydrated = false;

// Processing queue (in-memory only, rebuilt on scan)
const processingQueue = new Set<number>();
const currentlyProcessing = new Set<number>();
const connectedPorts = new Set<chrome.runtime.Port>();

// ===== STORAGE & STATE MANAGEMENT =====
const hydrateState = async () => {
    if (isStateHydrated) return;

    try {
        // 1. Hydrate Session Data (Suggestions)
        // Check for storage.session support (some contexts might not have it, but Manifest V3 usually does)
        const sessionData = await chrome.storage.session.get('suggestionCache');
        if (sessionData && Array.isArray(sessionData.suggestionCache)) {
            suggestionCache = new Map(sessionData.suggestionCache.map((s: TabSuggestionCache) => [s.tabId, s]));
        } else {
            suggestionCache = new Map();
        }

        // 2. Hydrate Local Data (Rejected Tabs)
        const localData = await StorageManager.getLocal();
        if (localData.rejectedTabs) {
            rejectedTabs = new Set(localData.rejectedTabs);
        } else {
            rejectedTabs = new Set();
        }

        isStateHydrated = true;
        // console.log(`[Background] State hydrated: ${suggestionCache.size} suggestions, ${rejectedTabs.size} rejected tabs`);
    } catch (e) {
        console.error("[Background] Failed to hydrate state:", e);
    }
};

const persistState = async () => {
    try {
        // 1. Persist Session Data
        await chrome.storage.session.set({
            suggestionCache: Array.from(suggestionCache.values())
        });

        // 2. Persist Local Data
        // Note: We only need to update if changed, but simple set is fine.
        // Optimizing: only write rejectedTabs logic if we changed it? 
        // For safety, just write it.
        await StorageManager.setLocal({
            rejectedTabs: Array.from(rejectedTabs)
        });
    } catch (e) {
        console.error("[Background] Failed to persist state:", e);
    }
};

// ===== BROADCASTS =====
// Broadcsts are now just "pings" to tell UI to check storage, OR providing transient status.
// UI listens to storage.onChanged for data, so we don't strictly need to send data here,
// but sending it is a nice optimization if port is alive.
const broadcastCacheUpdate = async () => {
    // Ensure storage is updated first
    await persistState();
};

const broadcastProcessingStatus = () => {
    const isProcessing = (processingQueue.size + currentlyProcessing.size) > 0;
    const response: TabGroupResponse = {
        type: 'PROCESSING_STATUS',
        isProcessing
    };

    for (const port of connectedPorts) {
        try {
            port.postMessage(response);
        } catch (e) {
            connectedPorts.delete(port);
        }
    }
};

// ===== LOGIC =====

const invalidateCache = async () => {
    console.log("[Background] Invalidating cache due to group change");

    await hydrateState();
    suggestionCache.clear();
    // rejectedTabs.clear(); // Keep rejected tabs persistent even if groups change? 
    // Actually, if groups change, maybe a rejected tab is now valid for a new group?
    // Let's keep rejectedTabs for now to prevent annoyance. 

    await persistState();
    // broadcastCacheUpdate handles the storage set, so we can just call it or persist then broadcast
    await broadcastCacheUpdate();

    // Re-queue
    await queueUngroupedTabs();
};

const queueUngroupedTabs = async (windowId?: number) => {
    await hydrateState();

    const queryInfo: chrome.tabs.QueryInfo = { windowType: chrome.tabs.WindowType.NORMAL };
    if (windowId) queryInfo.windowId = windowId;

    const allTabs = await chrome.tabs.query(queryInfo);

    // Filter out tabs that are already grouped, cached, processing, or rejected
    const tabsToProcess = allTabs.filter(t =>
        t.groupId === chrome.tabs.TAB_ID_NONE &&
        t.id &&
        t.url &&
        t.title &&
        t.status === 'complete' && // Only process loaded tabs
        !suggestionCache.has(t.id) &&
        !currentlyProcessing.has(t.id) &&
        !rejectedTabs.has(t.id)
    );

    let added = false;
    for (const tab of tabsToProcess) {
        if (tab.id && !processingQueue.has(tab.id)) {
            processingQueue.add(tab.id);
            added = true;
        }
    }

    if (added || processingQueue.size > 0) {
        broadcastProcessingStatus();
        scheduleProcessing();
    }
};

const scheduleProcessing = () => {
    // Use alarms to wake up the SW
    // We update the alarm to delay it (debounce)
    console.log("[Background] Scheduling processing alarm");
    chrome.alarms.create(ALARM_NAME, { when: Date.now() + PROCESS_DELAY_MS });
};

const processQueue = async () => {
    await hydrateState();

    if (processingQueue.size === 0) return;

    // AI Check
    if (!self.LanguageModel) return;
    try {
        const availability = await self.LanguageModel.availability();
        if (availability === 'unavailable') return;
    } catch (e) {
        return;
    }

    const tabIds = Array.from(processingQueue);
    processingQueue.clear();

    for (const id of tabIds) currentlyProcessing.add(id);
    broadcastProcessingStatus();

    try {
        // Fetch all tabs in the queue to determine their windows
        const tabsInQueue = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
        const validTabs = tabsInQueue.filter(t => t !== null && t.id && t.url && t.title) as chrome.tabs.Tab[];

        // Group by windowId
        const tabsByWindow = new Map<number, chrome.tabs.Tab[]>();
        for (const tab of validTabs) {
            const winId = tab.windowId;
            if (!tabsByWindow.has(winId)) tabsByWindow.set(winId, []);
            tabsByWindow.get(winId)!.push(tab);
        }

        const now = Date.now();

        // Process per window
        for (const [windowId, tabs] of tabsByWindow) {
            // Verify window type is normal
            try {
                const window = await chrome.windows.get(windowId);
                if (window.type !== chrome.tabs.WindowType.NORMAL) continue;
            } catch (e) {
                // Window might have closed
                continue;
            }

            const existingGroups = await chrome.tabGroups.query({ windowId });
            const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

            // Virtual groups from cache (global or per window? Cache is global map, but we should reuse names if they make sense)
            // Ideally we check if virtual group name exists in cache and map to it? 
            // For now, let's just stick to the logic of finding existing virtual groups.
            // But wait, if we have a virtual group "News" in Window A, and we get "News" in Window B, should they share ID? 
            // No, tab groups are per window.
            // But the cache structure doesn't store windowId for the *Group*.
            // Simple approach: Treat virtual groups as just names. 

            const virtualGroups = new Map<string, { id: number; title: string }>();
            let nextVirtualId = -1;

            // We only care about virtual groups that *could* be relevant? 
            // Actually, if we reuse the same cache map, we might mix windows. 
            // But the existingGroupId logic handles real groups.
            // For virtual groups, we effectively just need to avoid collisions in the prompt context.
            // Let's just pass what we have.

            for (const cached of suggestionCache.values()) {
                if (cached.existingGroupId === null) {
                    if (!virtualGroups.has(cached.groupName)) {
                        virtualGroups.set(cached.groupName, { id: nextVirtualId--, title: cached.groupName });
                    }
                }
            }

            const allGroups = [...existingGroupsData, ...virtualGroups.values()];
            const tabsData = tabs.map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

            const groups = await generateTabGroupSuggestions(
                {
                    existingGroups: allGroups,
                    ungroupedTabs: tabsData
                },
                () => { },
                () => { }
            );

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
        }

        await persistState();
        broadcastCacheUpdate();
        broadcastProcessingStatus();

    } catch (err) {
        console.error("[Background] Processing error", err);
        for (const id of tabIds) currentlyProcessing.delete(id);
        broadcastProcessingStatus();
    }
};

// ===== LISTENERS =====

// 1. Alarms (The core fix)
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log("[Background] Alarm fired, processing queue");
        await processQueue();
    }
});

// 2. Tab Events
chrome.tabs.onCreated.addListener(async () => {
    // Just trigger a check, no logic here.
    // If tab is not complete, queueUngroupedTabs will ignore it but scheduling happens.
    // Actually, best to wait for update to complete.
    // But we should check just in case.
    await queueUngroupedTabs();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        // Tab finished loading or changed URL -> candidate for grouping
        if (changeInfo.url) {
            // URL changed: invalidate old cache for this tab
            await hydrateState();
            if (suggestionCache.delete(tabId)) {
                // If it was rejected but now URL changed, maybe it's valid again? 
                // Let's remove rejection.
                rejectedTabs.delete(tabId);
                await persistState();
                broadcastCacheUpdate();
            }
        }
        await queueUngroupedTabs();
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    await hydrateState();
    let changed = false;
    if (suggestionCache.delete(tabId)) changed = true;
    if (processingQueue.delete(tabId)) changed = true;
    if (currentlyProcessing.delete(tabId)) changed = true;

    if (changed) {
        await persistState();
        broadcastCacheUpdate();
    }
});

// 3. Group Events
chrome.tabGroups.onCreated.addListener(invalidateCache);
chrome.tabGroups.onRemoved.addListener(invalidateCache);
chrome.tabGroups.onUpdated.addListener(invalidateCache);

// 4. Connection
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tab-grouper') return;

    connectedPorts.add(port);
    port.onDisconnect.addListener(() => connectedPorts.delete(port));

    port.onMessage.addListener(async (msg) => {
        if (msg.type === 'GET_CACHED_SUGGESTIONS') {
            await hydrateState();
            // Send processing status


            port.postMessage({
                type: 'PROCESSING_STATUS',
                isProcessing: (processingQueue.size + currentlyProcessing.size) > 0
            } as TabGroupResponse);

            // Also trigger a check
            await queueUngroupedTabs();
        }

        if (msg.type === 'REJECT_SUGGESTIONS' && msg.rejectedTabIds) {
            await hydrateState();
            for (const tabId of msg.rejectedTabIds) {
                suggestionCache.delete(tabId);
                rejectedTabs.add(tabId);
            }
            await persistState();
            broadcastCacheUpdate();
        }

        // START_GROUPING logic can remain similar or reuse queue?
        // The original code had specific START_GROUPING for manual trigger.
        // We can keep logic but ensure it respects/updates storage.
        if (msg.type === 'START_GROUPING') {
            // ... (keep original manual grouping logic if needed, or redirect to queue?)
            // For now, let's just trigger queue processing heavily.
            // But wait, manual grouping usually implies "Group Now" and might force even rejected tabs?
            // The original implementation re-ran logic explicitly.
            // Let's copy that block but add persistence.
            try {
                if (!self.LanguageModel) {
                    port.postMessage({ type: 'ERROR', error: "AI API not supported." } as TabGroupResponse);
                    return;
                }
                const availability = await self.LanguageModel.availability();
                if (availability === 'unavailable') {
                    port.postMessage({ type: 'ERROR', error: "AI model unavailable." } as TabGroupResponse);
                    return;
                }

                await hydrateState();

                if (!msg.windowId) {
                    port.postMessage({ type: 'ERROR', error: "Window ID not specified." } as TabGroupResponse);
                    return;
                }
                const windowId = msg.windowId;

                // Verify window type
                const window = await chrome.windows.get(windowId);
                if (window.type !== chrome.tabs.WindowType.NORMAL) {
                    port.postMessage({ type: 'ERROR', error: "Grouping not supported in this window type." } as TabGroupResponse);
                    return;
                }

                const allTabs = await chrome.tabs.query({ windowId });
                const existingGroups = await chrome.tabGroups.query({ windowId });
                const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));
                const ungroupedTabs = allTabs.filter(t => t.groupId === chrome.tabs.TAB_ID_NONE && t.id && t.url && t.title);

                if (ungroupedTabs.length === 0) {
                    port.postMessage({ type: 'ERROR', error: "No ungrouped tabs." } as TabGroupResponse);
                    return;
                }

                suggestionCache.clear();

                const tabsData = ungroupedTabs.map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

                const groups = await generateTabGroupSuggestions(
                    { existingGroups: existingGroupsData, ungroupedTabs: tabsData },
                    (p) => port.postMessage({ type: 'PROGRESS', value: p } as TabGroupResponse),
                    () => port.postMessage({ type: 'SESSION_CREATED' } as TabGroupResponse)
                );

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

                await persistState();

                port.postMessage({ type: 'COMPLETE', groups } as TabGroupResponse);
                broadcastCacheUpdate();

            } catch (err: any) {
                console.error(err);
                port.postMessage({ type: 'ERROR', error: err.message } as TabGroupResponse);
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

// Startup check
hydrateState().then(() => queueUngroupedTabs());

