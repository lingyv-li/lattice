import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';
import { TabGroupMessageType } from '../types/tabGrouper';

import { updateWindowBadge } from '../utils/badge';
import { ErrorStorage } from '../utils/errorStorage';
import { AIProviderType, SettingsStorage } from '../utils/storage';
import { FeatureId } from '../types/features';

console.log("[Background] Service Worker Initialized");
StateService.clearProcessingStatus().catch(err => console.error("[Background] Failed to clear processing status", err));

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        const settings = await SettingsStorage.get();
        if (!settings.hasCompletedOnboarding) {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/index.html') });
        }
    }
});

// ===== STATE =====
// Processing queue managed by ProcessingState
// This handles status updates internally and syncs to storage
const processingState = new ProcessingState();

// ===== BROADCASTS =====
// Update badge on data change
StateService.subscribeGlobal(async () => {
    await performBadgeUpdate();
});

// ===== BADGE LOGIC =====
// Removed local implementation in favor of utils/badge.ts

const performBadgeUpdate = async () => {
    const settings = await SettingsStorage.get();

    // Check if Tab Grouper is enabled but no AI provider configured
    if (settings.features?.[FeatureId.TabGrouper]?.enabled &&
        settings.aiProvider === AIProviderType.None) {
        // Show configuration needed badge on all windows
        const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
        for (const window of allWindows) {
            await updateWindowBadge(window.id!, false, 0, 0, false, '!', '#FFA500');
        }
        return;
    }

    // Check for global error
    const hasError = await ErrorStorage.hasErrors();

    const isProcessing = processingState.isProcessing;

    // Get all normal windows
    const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'], populate: true });

    // Count unique NEW groups per window (existingGroupId === null)
    for (const window of allWindows) {
        const windowId = window.id!;
        const validTabIds = new Set(window.tabs?.map(t => t.id).filter((id): id is number => id !== undefined) || []);

        const windowCache = await StateService.getSuggestionCache(windowId);
        const newGroupNames = new Set<string>();

        // Filter and count only valid suggestions
        for (const [tabId, cached] of windowCache.entries()) {
            if (!validTabIds.has(tabId)) continue;

            if (cached.groupName && cached.existingGroupId === null) {
                newGroupNames.add(cached.groupName);
            }
        }

        // Asynchronously clean up stale cache entries
        StateService.pruneSuggestions(windowId, validTabIds).catch(console.error);

        const duplicateCount = await StateService.getDuplicateCount(windowId);
        await updateWindowBadge(windowId, isProcessing, newGroupNames.size, duplicateCount, hasError);
    }
};


// ===== LOGIC =====

const queueProcessor = new QueueProcessor(processingState);
const tabManager = new TabManager(processingState, queueProcessor);

// ===== LISTENERS =====

// 5. Active Tab Change (Update badge for new active tab)
chrome.tabs.onActivated.addListener(async (_activeInfo) => {
    await performBadgeUpdate();
});

// 6. Connection
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tab-grouper') return;

    port.onMessage.addListener(async (msg) => {
        if (msg.type === TabGroupMessageType.TriggerProcessing) {
            // Trigger proactive check for new tabs
            tabManager.triggerRecalculation('UI Connected');
        } else if (msg.type === TabGroupMessageType.RegenerateSuggestions) {
            if (msg.windowId) {
                console.log(`[Background] Regenerating suggestions for window ${msg.windowId}`);
                await StateService.clearWindowCache(msg.windowId);
                await StateService.clearWindowSnapshot(msg.windowId); // Force re-process
                tabManager.triggerRecalculation('Regenerate Request');
            }
        }
    });
});

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
