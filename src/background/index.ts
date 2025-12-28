import { getSettings } from '../utils/storage';
import { scanDownloads } from '../utils/cleaner';

import { TabGroupResponse } from '../types/tabGrouper';

import { generateTabGroupSuggestions } from '../utils/ai';

console.log("Background Service Worker Initialized");
console.log("AI Availability:", self.LanguageModel ? "Available" : "Not Available");

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tab-grouper') return;

    port.onMessage.addListener(async (msg) => {
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

                port.postMessage({ type: 'COMPLETE', groups } as TabGroupResponse);

            } catch (err: any) {
                console.error(err);
                port.postMessage({ type: 'ERROR', error: err.message || "An error occurred." } as TabGroupResponse);
            }
        }
    });
});


// Ensure clicking the icon opens the side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Log every status update to see if logic is reached
    if (changeInfo.status === 'complete') {
        console.log(`Tab updated: ${tabId}, URL: ${tab.url}`);
    }

    if (changeInfo.status === 'complete' && tab.url === 'chrome://downloads/') {
        console.log('Detected navigation to chrome://downloads/');

        try {
            // Check settings
            console.log('Fetching settings...');
            const settings = await getSettings();
            console.log('Settings:', JSON.stringify(settings));

            if (!settings.scanMissing && !settings.scanInterrupted) {
                console.log('Scanning disabled by settings');
                return;
            }

            console.log('Starting download scan...');
            const result = await scanDownloads();

            // Filter based on settings
            let cleanableCount = 0;
            if (settings.scanMissing) cleanableCount += result.missingFiles.length;
            if (settings.scanInterrupted) cleanableCount += result.interruptedFiles.length;

            console.log(`Scan complete. Cleanable items matching settings: ${cleanableCount} (Missing: ${result.missingFiles.length}, Interrupted: ${result.interruptedFiles.length})`);

            if (cleanableCount > 0) {
                console.log('Cleanable items found. enabling and opening side panel...');
                // Open side panel requires user gesture, so we just enable it and show a badge
                await chrome.action.setBadgeText({ tabId, text: cleanableCount.toString() });
                await chrome.action.setBadgeBackgroundColor({ tabId, color: '#E53935' }); // Red color

                console.log('Side panel enabled and badge set. User must click icon to open.');
            } else {
                console.log('No cleanable items found, disabling side panel.');
                await chrome.sidePanel.setOptions({
                    tabId,
                    enabled: false
                });
                await chrome.action.setBadgeText({ tabId, text: '' });
            }
        } catch (error) {
            console.error('Error in background script:', error);
        }
    } else if (changeInfo.status === 'complete' && !tab.url?.startsWith('chrome://downloads')) {
        // Disable side panel on other tabs to avoid clutter
        // We catch errors just in case the tab closed
        try {
            await chrome.sidePanel.setOptions({
                tabId,
                enabled: false
            });
            await chrome.action.setBadgeText({ tabId, text: '' });
        } catch (e) {
            // ignore
        }
    }
});
