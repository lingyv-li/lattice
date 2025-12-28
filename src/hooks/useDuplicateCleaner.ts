import { useState } from 'react';

export type DuplicateCleanerStatus = 'idle' | 'scanning' | 'cleaning' | 'success' | 'error';

export const useDuplicateCleaner = () => {
    const [status, setStatus] = useState<DuplicateCleanerStatus>('idle');
    const [closedCount, setClosedCount] = useState<number>(0);

    const closeDuplicates = async () => {
        setStatus('scanning');
        setClosedCount(0);

        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const urlMap = new Map<string, chrome.tabs.Tab[]>();

            // Group by URL
            tabs.forEach(tab => {
                if (!tab.url) return;
                // Normalize URL: remove trailing slash for consistency
                const normalizedUrl = tab.url.replace(/\/$/, '');
                const group = urlMap.get(normalizedUrl) || [];
                group.push(tab);
                urlMap.set(normalizedUrl, group);
            });

            const tabsToRemove: number[] = [];
            let duplicateCount = 0;

            urlMap.forEach((group) => {
                if (group.length > 1) {
                    // Sort to find the "keeper"
                    // Priority: Pinned > Active > Oldest (lowest ID)
                    group.sort((a, b) => {
                        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                        if (a.active !== b.active) return a.active ? -1 : 1;
                        return (a.id || 0) - (b.id || 0);
                    });

                    // Keep the first one, remove the rest
                    const duplicates = group.slice(1);
                    duplicates.forEach(d => {
                        if (d.id) tabsToRemove.push(d.id);
                    });
                    duplicateCount += duplicates.length;
                }
            });

            if (tabsToRemove.length > 0) {
                setStatus('cleaning');
                await chrome.tabs.remove(tabsToRemove);
                setClosedCount(duplicateCount);
            }

            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);

        } catch (err) {
            console.error('Failed to close duplicates:', err);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    return {
        status,
        closedCount,
        closeDuplicates
    };
};
