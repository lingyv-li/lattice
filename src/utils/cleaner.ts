export interface ScanResult {
    missingFiles: chrome.downloads.DownloadItem[];
    interruptedFiles: chrome.downloads.DownloadItem[];
    totalCleanable: number;
}

/**
 * Scans for downloads that are either missing (file deleted) or interrupted (failed).
 */
export const scanDownloads = async (): Promise<ScanResult> => {
    return new Promise((resolve) => {
        chrome.downloads.search({}, (items) => {
            const missingFiles = items.filter(
                (item) => item.state === 'complete' && !item.exists
            );
            const interruptedFiles = items.filter(
                (item) => item.state === 'interrupted'
            );

            resolve({
                missingFiles,
                interruptedFiles,
                totalCleanable: missingFiles.length + interruptedFiles.length,
            });
        });
    });
};

/**
 * Erases a list of download IDs from the history.
 */
export const cleanDownloads = async (ids: number[]): Promise<void> => {
    return new Promise((resolve) => {
        // chrome.downloads.erase accepts a query, but we can't pass a list of IDs directly as a single query unless we loop
        // OR we can use simple loop. Erase takes a query. {id: 123} works.
        // Actually Promise.all is better.

        // Wait, chrome.downloads.erase signature: erase(query: DownloadQuery, callback?: function)
        // Check if query supports list of IDs? documentation says DownloadQuery has `id` (number), NOT array.
        // So we must iterate.

        const promises = ids.map(id =>
            new Promise<void>(res => chrome.downloads.erase({ id }, () => res()))
        );

        Promise.all(promises).then(() => resolve());
    });
};
