import { getSettings } from '../utils/storage';
import { scanDownloads } from '../utils/cleaner';

console.log('Chrome Cleaner Background Service Worker Started');


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

                // Enable side panel specific to this tab
                await chrome.sidePanel.setOptions({
                    tabId,
                    path: 'src/sidepanel/index.html',
                    enabled: true
                });

                // Attempt to open it. This requires a user gesture in most cases, 
                // but might work if triggered closely to navigation or if dev mode is loose.
                // If it fails, the user will see the icon and can click it.
                try {
                    await chrome.sidePanel.open({ tabId });
                    console.log('Side panel opened successfully.');
                } catch (e) {
                    console.log('Could not auto-open side panel (likely needs user gesture):', e);
                }
            } else {
                console.log('No cleanable items found, disabling side panel.');
                await chrome.sidePanel.setOptions({
                    tabId,
                    enabled: false
                });
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
        } catch (e) {
            // ignore
        }
    }
});
