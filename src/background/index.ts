import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { generateTabGroupSuggestions } from '../utils/ai';
import { updateWindowBadge } from '../utils/badge';

import { TabGroupResponse } from '../types/tabGrouper';

console.log("[Background] Service Worker Initialized");

// ===== CONSTANTS =====
const PROCESS_TABS_ALARM_NAME = 'process_tabs_alarm';
const PROCESS_DELAY_MS = 1000; // Wait 1s after last event before processing

// ===== STATE =====
// ===== STATE =====
// Processing queue managed by ProcessingState
// This handles status updates internally and fires the callback on change
const processingState = new ProcessingState(async (isProcessing) => {
    await broadcastProcessingStatus(isProcessing);
});

const connectedPorts = new Set<chrome.runtime.Port>();

// ===== BROADCASTS =====
// Update badge on data change
StateService.subscribe(async () => {
    await performBadgeUpdate();
});

// ===== BADGE LOGIC =====
// Removed local implementation in favor of utils/badge.ts

const performBadgeUpdate = async () => {
    const isProcessing = processingState.isProcessing;

    // We need to calculate group counts PER WINDOW
    // 1. Fetch all tabs to map tabId -> windowId
    const allTabs = await chrome.tabs.query({});
    const tabWindowMap = new Map<number, number>();
    const windows = new Set<number>();

    for (const tab of allTabs) {
        if (tab.id && tab.windowId) {
            tabWindowMap.set(tab.id, tab.windowId);
            windows.add(tab.windowId);
        }
    }

    // 2. Count unique groups per window from cache
    const windowGroupCounts = new Map<number, Set<string>>();
    const cache = await StateService.getSuggestionCache();

    for (const cached of cache.values()) {
        const winId = tabWindowMap.get(cached.tabId);
        if (winId && cached.groupName && cached.existingGroupId === null) {
            if (!windowGroupCounts.has(winId)) {
                windowGroupCounts.set(winId, new Set());
            }
            windowGroupCounts.get(winId)!.add(cached.groupName);
        }
    }

    // 3. Update badge for each window
    for (const windowId of windows) {
        const groupCount = windowGroupCounts.get(windowId)?.size || 0;
        await updateWindowBadge(windowId, isProcessing, groupCount);
    }
};

const broadcastProcessingStatus = async (isProcessing: boolean) => {
    const response: TabGroupResponse = {
        type: 'PROCESSING_STATUS',
        isProcessing
    };

    // Update badge on status change
    await performBadgeUpdate();

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

    await StateService.clearCache();
    await StateService.clearCache();

    // Re-queue
    await queueUngroupedTabs();
};

const queueUngroupedTabs = async (windowId?: number) => {
    const queryInfo: chrome.tabs.QueryInfo = { windowType: chrome.tabs.WindowType.NORMAL };
    if (windowId) queryInfo.windowId = windowId;

    const allTabs = await chrome.tabs.query(queryInfo);
    const cache = await StateService.getSuggestionCache();

    // Filter out tabs that are already grouped, cached, or processing
    const tabsToProcess = allTabs.filter(t =>
        t.groupId === chrome.tabs.TAB_ID_NONE &&
        t.id &&
        t.url &&
        t.title &&
        t.status === 'complete' && // Only process loaded tabs
        !cache.has(t.id) &&
        !processingState.has(t.id)
    );

    let added = false;
    for (const tab of tabsToProcess) {
        if (tab.id && processingState.add(tab.id)) {
            added = true;
        }
    }

    if (added || processingState.size > 0) {
        scheduleProcessing();
    }
};

const scheduleProcessing = () => {
    // Use alarms to wake up the SW
    // We update the alarm to delay it (debounce)
    console.log("[Background] Scheduling processing alarm");
    chrome.alarms.create(PROCESS_TABS_ALARM_NAME, { when: Date.now() + PROCESS_DELAY_MS });
};

const queueProcessor = new QueueProcessor(processingState);

// ===== LISTENERS =====

// 1. Alarms (The core fix)
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === PROCESS_TABS_ALARM_NAME) {
        console.log("[Background] Alarm fired, processing queue");
        await queueProcessor.process();
    }
});

// 2. Tab Events
chrome.tabs.onCreated.addListener(async (tab) => {
    // If tab is not complete, queueUngroupedTabs will ignore it but scheduling happens.
    // Check just in case.
    if (tab.status !== 'loading') {
        await queueUngroupedTabs();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.url) {
        // URL changed: invalidate old cache for this tab
        await StateService.removeSuggestion(tabId);
    }
    if (changeInfo.status === 'complete') {
        // Tab finished loading -> candidate for grouping
        await queueUngroupedTabs();
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    await StateService.removeSuggestion(tabId);
    processingState.remove(tabId);
});

// 3. Group Events
chrome.tabGroups.onCreated.addListener(invalidateCache);
chrome.tabGroups.onRemoved.addListener(invalidateCache);
chrome.tabGroups.onUpdated.addListener(invalidateCache);

// 5. Active Tab Change (Update badge for new active tab)
chrome.tabs.onActivated.addListener(async (_activeInfo) => {
    await performBadgeUpdate();
});

// 6. Connection
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tab-grouper') return;

    connectedPorts.add(port);
    port.onDisconnect.addListener(() => connectedPorts.delete(port));

    port.onMessage.addListener(async (msg) => {
        if (msg.type === 'GET_CACHED_SUGGESTIONS') {
            await StateService.hydrate();
            // Send processing status


            port.postMessage({
                type: 'PROCESSING_STATUS',
                isProcessing: processingState.isProcessing
            } as TabGroupResponse);

            // Also trigger a check
            await queueUngroupedTabs();
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

                if (!msg.windowId) {
                    port.postMessage({ type: 'ERROR', error: "Window ID not specified." } as TabGroupResponse);
                    return;
                }
                const windowId = msg.windowId;

                // Verify window type
                const window = await chrome.windows.get(windowId);
                if (window.type !== chrome.windows.WindowType.NORMAL) {
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

                await StateService.clearCache();

                const tabsData = ungroupedTabs.map(t => ({ id: t.id!, title: t.title!, url: t.url! }));

                const groups = await generateTabGroupSuggestions(
                    { existingGroups: existingGroupsData, ungroupedTabs: tabsData },
                    (p) => port.postMessage({ type: 'PROGRESS', value: p } as TabGroupResponse),
                    () => port.postMessage({ type: 'SESSION_CREATED' } as TabGroupResponse)
                );

                const now = Date.now();
                const groupedTabIds = new Set<number>();
                for (const group of groups) {
                    for (const tabId of group.tabIds) {
                        groupedTabIds.add(tabId);
                        await StateService.updateSuggestion({
                            tabId,
                            groupName: group.groupName,
                            existingGroupId: group.existingGroupId || null,
                            timestamp: now
                        });
                    }
                }

                // Cache negative results for manual run too
                for (const tab of tabsData) {
                    if (!groupedTabIds.has(tab.id)) {
                        await StateService.updateSuggestion({
                            tabId: tab.id,
                            groupName: null,
                            existingGroupId: null,
                            timestamp: now
                        });
                    }
                }

                port.postMessage({ type: 'COMPLETE', groups } as TabGroupResponse);
                // Cache update happens via StateService listener

            } catch (err: any) {
                console.error(err);
                port.postMessage({ type: 'ERROR', error: err.message } as TabGroupResponse);
            }
        }
    });
});

// Startup check
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
queueUngroupedTabs();


