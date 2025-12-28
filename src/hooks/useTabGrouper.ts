import { useState, useEffect, useRef } from 'react';
import { TabGroupResponse, TabGroupSuggestion } from '../types/tabGrouper';

export type { TabGroupSuggestion };

export type TabGrouperStatus = 'idle' | 'initializing' | 'processing' | 'reviewing' | 'success' | 'error';

export const useTabGrouper = () => {
    const [status, setStatus] = useState<TabGrouperStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [previewGroups, setPreviewGroups] = useState<(TabGroupSuggestion & { existingGroupId?: number | null })[] | null>(null);
    const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
    const [tabDataMap, setTabDataMap] = useState<Map<number, { title: string, url: string }>>(new Map());
    const [availability, setAvailability] = useState<'available' | 'downloadable' | 'downloading' | 'unavailable' | null>(null);

    // Store port reference
    const portRef = useRef<chrome.runtime.Port | null>(null);

    useEffect(() => {
        const checkAvailability = async () => {
            // Check local availability first as a hint, but real work happens in background.
            if (window.LanguageModel) {
                const avail = await window.LanguageModel.availability();
                setAvailability(avail);
            } else {
                setAvailability('unavailable');
            }
        };
        checkAvailability();

        return () => {
            if (portRef.current) {
                portRef.current.disconnect();
            }
        };
    }, []);

    const generateGroups = async () => {
        setStatus('processing');
        setError(null);
        setProgress(null);
        setPreviewGroups(null);

        try {
            // Re-populate tab map for previews
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            const ungroupedTabs = allTabs.filter(t => t.groupId === chrome.tabs.TAB_ID_NONE);
            const map = new Map();
            ungroupedTabs.forEach(t => {
                if (t.id) map.set(t.id, { title: t.title, url: t.url });
            });
            setTabDataMap(map);

            // Connect to background
            const port = chrome.runtime.connect({ name: 'tab-grouper' });
            portRef.current = port;

            port.onMessage.addListener((msg: TabGroupResponse) => {
                if (msg.type === 'INITIALIZING') {
                    // This refers to model initialization
                    setStatus('initializing');
                } else if (msg.type === 'PROGRESS') {
                    // This refers to processing progress
                    setProgress(msg.value || 0);
                    setStatus('processing');
                } else if (msg.type === 'SESSION_CREATED') {
                    setStatus('processing');
                } else if (msg.type === 'COMPLETE') {
                    if (msg.groups) {
                        setPreviewGroups(msg.groups);
                        setSelectedPreviewIndices(new Set(msg.groups.map((_, i) => i)));
                        setStatus('reviewing');
                    } else {
                        setStatus('idle');
                    }
                    port.disconnect();
                    portRef.current = null;
                } else if (msg.type === 'ERROR') {
                    setError(msg.error || "Unknown error");
                    setStatus('error');
                    port.disconnect();
                    portRef.current = null;
                }
            });

            port.postMessage({ type: 'START_GROUPING' });

        } catch (err: any) {
            console.error(err);
            setError(err.message || "An error occurred while starting grouping.");
            setStatus('error');
        }
    };

    const applyGroups = async () => {
        if (!previewGroups) return;
        setStatus('processing');

        try {
            for (let i = 0; i < previewGroups.length; i++) {
                if (!selectedPreviewIndices.has(i)) continue;

                const group = previewGroups[i];
                if (group.tabIds.length > 0) {
                    const validTabIds = group.tabIds.filter(id => tabDataMap.has(id));

                    if (validTabIds.length > 0) {
                        if (group.existingGroupId) {
                            // Add to existing group
                            await chrome.tabs.group({
                                tabIds: validTabIds as [number, ...number[]],
                                groupId: group.existingGroupId
                            });
                        } else {
                            // Create new group
                            const groupId = await chrome.tabs.group({ tabIds: validTabIds as [number, ...number[]] });
                            await chrome.tabGroups.update(groupId, { title: group.groupName });
                        }
                    }
                }
            }
            setStatus('success');
            setPreviewGroups(null);
            setTimeout(() => setStatus('idle'), 3000);
        } catch (err: any) {
            setError(err.message || "Failed to apply groups.");
            setStatus('error');
        }
    };

    const cancelGroups = () => {
        setPreviewGroups(null);
        setStatus('idle');
    };

    const toggleGroupSelection = (idx: number) => {
        const newSet = new Set(selectedPreviewIndices);
        if (newSet.has(idx)) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        setSelectedPreviewIndices(newSet);
    };

    return {
        status,
        error,
        progress,
        previewGroups,
        setPreviewGroups,
        selectedPreviewIndices,
        tabDataMap,
        availability,
        generateGroups,
        applyGroups,
        cancelGroups,
        toggleGroupSelection
    };
};
