import { getSettings } from '../utils/storage';
import { scanDownloads } from '../utils/cleaner';

console.log('Chrome Cleaner Background Service Worker Started');


// Track the popup window to prevent duplicates
let cleanerWindowId: number | undefined;

// Ensure clicking the icon opens the side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Clean up window ID if it's closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === cleanerWindowId) {
        cleanerWindowId = undefined;
    }
});

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

                // Enable side panel specific to this tab
                await chrome.sidePanel.setOptions({
                    tabId,
                    path: 'src/sidepanel/index.html',
                    enabled: true
                });

                // Open side panel requires user gesture, so we just enable it and show a badge
                // Also open a small popup window if not already open
                if (!cleanerWindowId) {
                    try {
                        const win = await chrome.windows.create({
                            url: 'src/sidepanel/index.html',
                            type: 'popup',
                            width: 380,
                            height: 600,
                            focused: true
                        });
                        if (win) {
                            cleanerWindowId = win.id;
                            console.log('Cleaner popup opened automatically:', cleanerWindowId);
                        }
                    } catch (e) {
                        console.error('Failed to open popup window:', e);
                    }
                } else {
                    // Focus existing window
                    try {
                        await chrome.windows.update(cleanerWindowId, { focused: true });
                    } catch (e) {
                        cleanerWindowId = undefined; // Window might have been closed/invalid
                    }
                }

                console.log('Side panel enabled and badge set. Popup attempted.');
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
