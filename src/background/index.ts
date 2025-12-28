import { initializeDownloadMonitor } from '../utils/downloadMonitor';
import { generateTabGroupSuggestions } from '../utils/ai';

import { TabGroupResponse } from '../types/tabGrouper';



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

// Initialize download monitoring
initializeDownloadMonitor();
