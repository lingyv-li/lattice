import { useState, useEffect, useCallback } from 'react';
import { findDuplicates, countDuplicates, DuplicateCloser } from '../services/duplicates';
import { OrganizerStatus } from '../types/organizer';

export const useDuplicateCleaner = () => {
    const [status, setStatus] = useState<OrganizerStatus>(OrganizerStatus.Idle);
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

        const handleTabUpdate = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, _tab: chrome.tabs.Tab) => {
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
        setStatus(OrganizerStatus.Applying);

        try {
            const result = await DuplicateCloser.closeDuplicates();

            if (result.closedCount > 0) {
                setClosedCount(result.closedCount);
                setStatus(OrganizerStatus.Success);
            } else {
                setStatus(OrganizerStatus.Idle);
            }

            // Re-scan immediately to update UI
            await scanDuplicates();

            setTimeout(() => {
                setStatus(OrganizerStatus.Idle);
                setClosedCount(0);
            }, 3000);

        } catch (err) {
            console.error('Failed to clean duplicates:', err);
            setStatus(OrganizerStatus.Error);
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);
        }
    };

    return {
        status,
        closedCount,
        duplicateCount,
        closeDuplicates
    };
};
