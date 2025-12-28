import { useState, useEffect, useCallback } from 'react';

export type DuplicateCleanerStatus = 'idle' | 'scanning' | 'cleaning' | 'success' | 'error';

export const useDuplicateCleaner = () => {
    const [status, setStatus] = useState<DuplicateCleanerStatus>('idle');
    const [closedCount, setClosedCount] = useState<number>(0);
    const [duplicateCount, setDuplicateCount] = useState<number>(0);

    const scanDuplicates = useCallback(async () => {
        // Don't change status to 'scanning' here to avoid flickering UI on every tab change
        // just silently update the count.
        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const urlMap = new Map<string, chrome.tabs.Tab[]>();

            tabs.forEach(tab => {
                if (!tab.url) return;
                const normalizedUrl = tab.url.replace(/\/$/, '');
                const group = urlMap.get(normalizedUrl) || [];
                group.push(tab);
                urlMap.set(normalizedUrl, group);
            });

            let count = 0;
            urlMap.forEach((group) => {
                if (group.length > 1) {
                    count += group.length - 1;
                }
            });

            setDuplicateCount(count);
        } catch (err) {
            console.error('Failed to scan duplicates:', err);
        }
    }, []);

    useEffect(() => {
        scanDuplicates();

        const handleTabUpdate = (_tabId: number, changeInfo: any, _tab: chrome.tabs.Tab) => {
            if (changeInfo.url || changeInfo.status === 'complete') {
                scanDuplicates();
            }
        };
        const handleTabEvent = () => scanDuplicates();

        chrome.tabs.onUpdated.addListener(handleTabUpdate);
        chrome.tabs.onCreated.addListener(handleTabEvent);
        chrome.tabs.onRemoved.addListener(handleTabEvent);

        return () => {
            chrome.tabs.onUpdated.removeListener(handleTabUpdate);
            chrome.tabs.onCreated.removeListener(handleTabEvent);
            chrome.tabs.onRemoved.removeListener(handleTabEvent);
        };
    }, [scanDuplicates]);

    const closeDuplicates = async () => {
        setStatus('cleaning');

        try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const urlMap = new Map<string, chrome.tabs.Tab[]>();

            tabs.forEach(tab => {
                if (!tab.url) return;
                const normalizedUrl = tab.url.replace(/\/$/, '');
                const group = urlMap.get(normalizedUrl) || [];
                group.push(tab);
                urlMap.set(normalizedUrl, group);
            });

            const tabsToRemove: number[] = [];
            let count = 0;

            urlMap.forEach((group) => {
                if (group.length > 1) {
                    // Priority: Pinned > Active > Oldest
                    group.sort((a, b) => {
                        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                        if (a.active !== b.active) return a.active ? -1 : 1;
                        return (a.id || 0) - (b.id || 0);
                    });

                    const duplicates = group.slice(1);
                    duplicates.forEach(d => {
                        if (d.id) tabsToRemove.push(d.id);
                    });
                    count += duplicates.length;
                }
            });

            if (tabsToRemove.length > 0) {
                await chrome.tabs.remove(tabsToRemove);
                setClosedCount(count);
                setStatus('success');
            } else {
                setStatus('idle');
            }

            // Re-scan immediately to update UI
            await scanDuplicates();

            setTimeout(() => {
                setStatus('idle');
                setClosedCount(0);
            }, 3000);

        } catch (err) {
            console.error('Failed to clean duplicates:', err);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    return {
        status,
        closedCount,
        duplicateCount,
        closeDuplicates
    };
};
