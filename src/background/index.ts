import { StateService } from './state';
import { ProcessingState } from './processing';
import { QueueProcessor } from './queueProcessor';
import { TabManager } from './tabManager';
import { TabGroupMessageType } from '../types/tabGrouper';
import { SettingsStorage } from '../utils/storage';
import { BadgeService } from '../services/BadgeService';

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
    await BadgeService.performBadgeUpdate(processingState);
});

// ===== LOGIC =====

const queueProcessor = new QueueProcessor(processingState);
const tabManager = new TabManager(processingState, queueProcessor);

// ===== LISTENERS =====

// 5. Active Tab Change (Update badge for new active tab)
chrome.tabs.onActivated.addListener(async _activeInfo => {
    await BadgeService.performBadgeUpdate(processingState);
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
