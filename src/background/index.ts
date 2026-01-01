import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';

import { updateWindowBadge } from '../utils/badge';
import { ErrorStorage } from '../utils/errorStorage';

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

    // Get all normal windows
    const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });

    // Count unique NEW groups per window (existingGroupId === null)
    for (const window of allWindows) {
        const windowId = window.id!;
        const windowCache = await StateService.getSuggestionCache(windowId);
        const newGroupNames = new Set<string>();

        for (const cached of windowCache.values()) {
            if (cached.groupName && cached.existingGroupId === null) {
                newGroupNames.add(cached.groupName);
            }
        }

        await updateWindowBadge(windowId, isProcessing, newGroupNames.size, hasError);
    }
};

const broadcastProcessingStatus = async (isProcessing: boolean) => {
    const response: TabGroupResponse = {
        type: 'PROCESSING_STATUS',
        isProcessing
    };

    // 1. Notify UI immediately (Priority)
    for (const port of connectedPorts) {
        try {
            port.postMessage(response);
        } catch (e) {
            connectedPorts.delete(port);
        }
    }

    // 2. Update badge (Secondary, can be slower)
    await performBadgeUpdate();
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

// 7. Alarm for periodic checks
const ALARM_NAME = 'periodic-grouping-check';
chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
        console.log(`[Background] Created periodic alarm every 30s`);
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        tabManager.triggerRecalculation('Alarm');
    }
});
