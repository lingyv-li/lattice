import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';

import { updateWindowBadge } from '../utils/badge';

import { TabGroupResponse } from '../types/tabGrouper';

console.log("[Background] Service Worker Initialized");

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

const queueProcessor = new QueueProcessor(processingState);
const tabManager = new TabManager(processingState, queueProcessor);

// ===== LISTENERS =====

// 2. Tab Events
chrome.tabs.onCreated.addListener(async (tab) => {
    // If tab is not complete, triggerRecalculation will handle it via debounce.
    if (tab.status !== 'loading') {
        tabManager.triggerRecalculation();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    await tabManager.handleTabUpdated(tabId, changeInfo);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    await StateService.removeSuggestion(tabId);
    processingState.remove(tabId);
});

// 3. Group Events
chrome.tabGroups.onCreated.addListener(() => tabManager.triggerRecalculation());
chrome.tabGroups.onRemoved.addListener(() => tabManager.triggerRecalculation());
chrome.tabGroups.onUpdated.addListener(() => tabManager.triggerRecalculation());

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
        if (msg.type === 'SYNC_STATE') {
            // Send current processing status to UI
            port.postMessage({
                type: 'PROCESSING_STATUS',
                isProcessing: processingState.isProcessing
            } as TabGroupResponse);

            // Trigger proactive check for new tabs
            tabManager.triggerRecalculation();
        }
    });
});

// Startup check
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
tabManager.triggerRecalculation();


