import { getSettings } from '../utils/storage';
import { scanDownloads } from '../utils/cleaner';

console.log('Chrome Cleaner Background Service Worker Started');

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
                console.log('Attempting to open popup window...');

                // Check if a popup is already open to avoid spam
                const windows = await chrome.windows.getAll({ populate: true });
                const existingPopup = windows.find(w => w.type === 'popup' && w.tabs?.some(t => t.url?.includes('popup/index.html')));

                if (existingPopup) {
                    console.log('Popup already open, focusing it.');
                    if (existingPopup.id) chrome.windows.update(existingPopup.id, { focused: true });
                    return;
                }

                const width = 340;
                const height = 450;

                // Get current window to center
                const currentWindow = await chrome.windows.getCurrent();
                const left = (currentWindow.left || 0) + ((currentWindow.width || 800) / 2) - (width / 2);
                const top = (currentWindow.top || 0) + ((currentWindow.height || 600) / 2) - (height / 2);

                chrome.windows.create({
                    url: 'src/popup/index.html',
                    type: 'popup',
                    width: width,
                    height: height,
                    left: Math.round(left),
                    top: Math.round(top),
                    focused: true
                });
            } else {
                console.log('No cleanable items found, skipping popup.');
            }
        } catch (error) {
            console.error('Error in background script:', error);
        }
    }
});
