import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';
import { TabGroupMessageType } from '../types/tabGrouper';
import { SettingsStorage } from '../utils/storage';
import { BadgeService } from '../services/BadgeService';
import { storePendingRejection } from '../utils/rejectionMemory';

console.log('[Background] Service Worker Initialized');
StateService.clearProcessingStatus().catch(err => console.error('[Background] Failed to clear processing status', err));

chrome.runtime.onInstalled.addListener(async details => {
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
    try {
        await BadgeService.performBadgeUpdate(processingState);
    } catch (err) {
        console.error('[Background] Failed to update badge', err);
    }
});

// ===== LOGIC =====

const queueProcessor = new QueueProcessor(processingState);
const tabManager = new TabManager(processingState, queueProcessor);

// ===== LISTENERS =====

// 5. Active Tab Change (Update badge for new active tab)
chrome.tabs.onActivated.addListener(async _activeInfo => {
    try {
        await BadgeService.performBadgeUpdate(processingState);
    } catch (err) {
        console.error('[Background] Failed to update badge on tab activate', err);
    }
});

// 6. Connection
chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'tab-grouper') return;

    port.onMessage.addListener(async msg => {
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
        } else if (msg.type === TabGroupMessageType.DismissSuggestion) {
            if (msg.windowId && msg.tabIds?.length) {
                // Capture rejection snapshot before removing from cache
                const cacheSamples = await Promise.all(msg.tabIds.map((tid: number) => StateService.getSuggestion(tid, msg.windowId)));
                const groupName = cacheSamples.find(s => s?.groupName)?.groupName;
                if (groupName) {
                    const chromeTabs = await Promise.all(msg.tabIds.map((tid: number) => chrome.tabs.get(tid).catch(() => null)));
                    const tabs = chromeTabs
                        .filter((t): t is chrome.tabs.Tab => t !== null)
                        .flatMap(t => {
                            if (!t.url) return [];
                            try {
                                return [{ title: t.title ?? '', hostname: new URL(t.url).hostname }];
                            } catch {
                                return [];
                            }
                        })
                        .filter(t => t.hostname);
                    if (tabs.length > 0) {
                        await storePendingRejection({ groupName, tabs, timestamp: new Date().toISOString() });
                    }
                }
                await StateService.removeSuggestionsForTabIds(msg.windowId, msg.tabIds);
            }
        }
    });
});

// 7. Alarm for periodic checks
const ALARM_NAME = 'periodic-grouping-check';
chrome.alarms.get(ALARM_NAME, alarm => {
    if (!alarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
        console.log(`[Background] Created periodic alarm every 30s`);
    }
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) {
        tabManager.triggerRecalculation('Alarm');
    }
});
