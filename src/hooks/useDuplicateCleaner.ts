import { useState, useEffect, useCallback } from 'react';
import { DuplicateCloser } from '../services/duplicates';
import { findDuplicates, getTabsToRemove } from '../services/duplicates/utils';
import { OrganizerStatus } from '../types/organizer';
// We still use StateService for initial signal if needed, but local calculation is better for UI details

export const useDuplicateCleaner = () => {
    const [status, setStatus] = useState<OrganizerStatus>(OrganizerStatus.Idle);
    const [duplicateGroups, setDuplicateGroups] = useState<Map<string, chrome.tabs.Tab[]>>(new Map());

    const scanDuplicates = useCallback(async () => {
        // Debounce slightly to avoid rapid updates during startup
        await new Promise(resolve => setTimeout(resolve, 100));

        const tabs = await chrome.tabs.query({ currentWindow: true });
        const map = findDuplicates(tabs);
        const duplicates = new Map<string, chrome.tabs.Tab[]>();

        map.forEach((group, url) => {
            if (group.length > 1) {
                duplicates.set(url, group);
            }
        });

        setDuplicateGroups(duplicates);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        scanDuplicates();

        const handleUpdate = () => scanDuplicates();
        chrome.tabs.onUpdated.addListener(handleUpdate);
        chrome.tabs.onRemoved.addListener(handleUpdate);
        chrome.tabs.onCreated.addListener(handleUpdate);

        return () => {
            chrome.tabs.onUpdated.removeListener(handleUpdate);
            chrome.tabs.onRemoved.removeListener(handleUpdate);
            chrome.tabs.onCreated.removeListener(handleUpdate);
        };
    }, [scanDuplicates]);

    const closeDuplicates = async () => {
        setStatus(OrganizerStatus.Applying);
        try {
            const result = await DuplicateCloser.closeDuplicates();
            if (result.closedCount > 0) {
                setStatus(OrganizerStatus.Success);
            } else {
                setStatus(OrganizerStatus.Idle);
            }
            // Scan will trigger automatically via listeners
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);
        } catch (err) {
            console.error('Failed to clean duplicates:', err);
            setStatus(OrganizerStatus.Error);
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);
        }
    };

    const closeDuplicateGroup = async (url: string) => {
        const group = duplicateGroups.get(url);
        if (!group) return;

        setStatus(OrganizerStatus.Applying);
        try {
            // Create a map with just this group to use the util
            const singleMap = new Map([[url, group]]);
            const tabsToRemove = getTabsToRemove(singleMap);

            if (tabsToRemove.length > 0) {
                await chrome.tabs.remove(tabsToRemove);
                setStatus(OrganizerStatus.Success);
            }
            setTimeout(() => setStatus(OrganizerStatus.Idle), 1000);
        } catch (err) {
            console.error('Failed to clean duplicate group:', err);
            setStatus(OrganizerStatus.Error);
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);
        }
    };

    return {
        status,
        duplicateGroups,
        totalDuplicateCount: Array.from(duplicateGroups.values()).reduce((acc, g) => acc + (g.length - 1), 0),
        closeDuplicates,
        closeDuplicateGroup
    };
};
