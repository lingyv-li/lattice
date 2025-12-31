import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';

import { updateWindowBadge } from '../utils/badge';
import { ErrorStorage } from '../utils/errorStorage';
import { SettingsStorage } from '../utils/storage';

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
    // Check for global error
    const hasError = await ErrorStorage.hasErrors();

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
        await updateWindowBadge(windowId, isProcessing, groupCount, hasError);
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
        tabManager.triggerRecalculation(`Tab Created ${tab.id}`);
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
chrome.tabGroups.onCreated.addListener((g) => tabManager.triggerRecalculation(`Group Created ${g.id}`));
chrome.tabGroups.onRemoved.addListener((g) => tabManager.triggerRecalculation(`Group Removed ${g.id}`));
chrome.tabGroups.onUpdated.addListener((g) => tabManager.triggerRecalculation(`Group Updated ${g.id}`));

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
            tabManager.triggerRecalculation('UI Connected');
        }
    });
});

// Enable action button.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Updating debounce delay.
SettingsStorage.subscribe((changes) => {
    if (changes.processingDebounceDelay) {
        const newDelay = changes.processingDebounceDelay.newValue;
        if (typeof newDelay === 'number') {
            tabManager.updateDebounceDelay(newDelay);
        }
    }
});
