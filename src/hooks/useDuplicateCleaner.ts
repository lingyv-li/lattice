import { useState, useEffect, useCallback } from 'react';
import { findDuplicates, countDuplicates } from '../utils/duplicates';
import { DuplicateCloser } from '../services/DuplicateCloser';

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
            const urlMap = findDuplicates(tabs);
            const count = countDuplicates(urlMap);

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
            const result = await DuplicateCloser.closeDuplicates();

            if (result.closedCount > 0) {
                setClosedCount(result.closedCount);
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
