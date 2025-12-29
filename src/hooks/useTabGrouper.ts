import { useState, useEffect, useRef, useCallback } from 'react';
import { TabGroupResponse, TabGroupSuggestion, TabGrouperStatus, TabSuggestionCache } from '../types/tabGrouper';

export type { TabGroupSuggestion };

export const useTabGrouper = () => {
    const [status, setStatus] = useState<TabGrouperStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);
    const [previewGroups, setPreviewGroups] = useState<(TabGroupSuggestion & { existingGroupId?: number | null })[] | null>(null);
    const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
    const [tabDataMap, setTabDataMap] = useState<Map<number, { title: string, url: string }>>(new Map());
    const [availability, setAvailability] = useState<'available' | 'downloadable' | 'downloading' | 'unavailable' | null>(null);
    const [ungroupedCount, setUngroupedCount] = useState<number | null>(null);
    const [isBackgroundProcessing, setBackgroundProcessing] = useState(false);

    // Store port reference
    const portRef = useRef<chrome.runtime.Port | null>(null);
    // Store current previews in ref to access inside listeners without re-subscribing
    const previewGroupsRef = useRef<typeof previewGroups>(null);
    // Store status in ref to access inside listeners without re-subscribing
    const statusRef = useRef<TabGrouperStatus>(status);

    // Update refs when state changes
    useEffect(() => {
        previewGroupsRef.current = previewGroups;
    }, [previewGroups]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);



    // Convert cached suggestions to preview groups
    const convertCacheToGroups = useCallback((cache: TabSuggestionCache[], tabMap: Map<number, { title: string, url: string }>) => {
        const groupMap = new Map<string, TabGroupSuggestion & { existingGroupId?: number | null }>();

        for (const cached of cache) {
            // Only include if tab still exists in our map
            if (!tabMap.has(cached.tabId)) continue;

            const key = cached.existingGroupId !== null
                ? `existing-${cached.existingGroupId}`
                : `new-${cached.groupName}`;

            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    groupName: cached.groupName,
                    tabIds: [],
                    existingGroupId: cached.existingGroupId
                });
            }

            groupMap.get(key)!.tabIds.push(cached.tabId);
        }

        return Array.from(groupMap.values());
    }, []);

    // Scan ungrouped tabs and update tab data map
    const scanUngrouped = useCallback(async () => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const ungrouped = tabs.filter(t => t.groupId === chrome.tabs.TAB_ID_NONE);
        setUngroupedCount(ungrouped.length);

        const map = new Map<number, { title: string, url: string }>();
        ungrouped.forEach(t => {
            if (t.id) map.set(t.id, { title: t.title || '', url: t.url || '' });
        });
        setTabDataMap(map);

        return map;
    }, []);

    useEffect(() => {
        const checkAvailability = async () => {
            if (window.LanguageModel) {
                const avail = await window.LanguageModel.availability();
                setAvailability(avail);
            } else {
                setAvailability('unavailable');
            }
        };
        checkAvailability();

        // Initial scan
        scanUngrouped();

        // --- Port Connection (Transient Status & Progress) ---
        let reconnectTimeout: NodeJS.Timeout;
        let isPortConnected = false;

        const connectPort = () => {
            if (isPortConnected) return;

            try {
                const port = chrome.runtime.connect({ name: 'tab-grouper' });
                portRef.current = port;
                isPortConnected = true;

                port.onDisconnect.addListener(() => {
                    console.log("[useTabGrouper] Port disconnected");
                    isPortConnected = false;
                    portRef.current = null;
                    setBackgroundProcessing(false); // Assume stopped processing if disconn? Or unknown?
                    // Attempt reconnect
                    reconnectTimeout = setTimeout(connectPort, 2000);
                });

                port.onMessage.addListener((msg: TabGroupResponse) => {
                    // We can still use CACHED_SUGGESTIONS from port as a "fast path" or ping,
                    // but we primarily rely on storage. 
                    // However, we MUST handle PROCESSING_STATUS here.
                    if (msg.type === 'PROCESSING_STATUS') {
                        setBackgroundProcessing(msg.isProcessing ?? false);
                    }
                });

                // Request status immediately
                chrome.windows.getCurrent().then(win => {
                    if (win.id && portRef.current) {
                        port.postMessage({ type: 'GET_CACHED_SUGGESTIONS', windowId: win.id });
                    }
                });

            } catch (e) {
                console.error("[useTabGrouper] Connection failed", e);
                reconnectTimeout = setTimeout(connectPort, 5000);
            }
        };

        connectPort();

        const handleTabEvent = () => scanUngrouped();
        chrome.tabs.onUpdated.addListener(handleTabEvent);
        chrome.tabs.onCreated.addListener(handleTabEvent);
        chrome.tabs.onRemoved.addListener(handleTabEvent);

        return () => {
            clearTimeout(reconnectTimeout);
            if (portRef.current) {
                portRef.current.disconnect();
            }
            chrome.tabs.onUpdated.removeListener(handleTabEvent);
            chrome.tabs.onCreated.removeListener(handleTabEvent);
            chrome.tabs.onRemoved.removeListener(handleTabEvent);
        };
    }, [scanUngrouped]);

    // --- Storage Listener for Suggestions ---
    useEffect(() => {
        const handleStorageChange = async (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'session' && changes.suggestionCache) {
                const newValue = changes.suggestionCache.newValue as TabSuggestionCache[] | undefined;
                const map = await scanUngrouped();

                let groups: (TabGroupSuggestion & { existingGroupId?: number | null })[] = [];
                if (newValue && Array.isArray(newValue) && newValue.length > 0) {
                    groups = convertCacheToGroups(newValue, map);
                }

                // Check if groups actually changed to prevent resetting selection
                // Use ref to compare against current state without adding dependency
                const currentGroups = previewGroupsRef.current;
                if (currentGroups && JSON.stringify(groups) === JSON.stringify(currentGroups)) {
                    return;
                }

                const currentStatus = statusRef.current;
                if (groups.length > 0 && currentStatus !== 'processing' && currentStatus !== 'initializing') {
                    // Smart Selection Preservation:
                    // If we have previous groups, try to preserve the selection state for identical groups
                    let newSelection = new Set<number>();

                    if (currentGroups && selectedPreviewIndices.size > 0) {
                        // Create a signature set of currently selected groups
                        const selectedSignatures = new Set<string>();
                        currentGroups.forEach((g, idx) => {
                            if (selectedPreviewIndices.has(idx)) {
                                selectedSignatures.add(JSON.stringify(g));
                            }
                        });

                        // For each new group, check if it matches a previously selected one
                        groups.forEach((g, idx) => {
                            // If it matches a selected group, select it. 
                            // Or if it's a completely new set (no previous groups), select all (handled by default below).
                            if (selectedSignatures.has(JSON.stringify(g))) {
                                newSelection.add(idx);
                            }
                        });

                        // If we found NO matches (totally new suggestions), default to Select All
                        // But if we found *some* matches, implies a partial update, so we trust our preservation.
                        // Edge case: entire set changed but we wanted to select all? 
                        // If selectedSignatures was NOT empty, but newSelection IS empty, it means we lost all selected groups.
                        // In that case, maybe default to Select All again?
                        if (newSelection.size === 0 && selectedSignatures.size > 0) {
                            newSelection = new Set(groups.map((_, i) => i));
                        }
                    } else {
                        // No previous selection or groups, select all by default
                        newSelection = new Set(groups.map((_, i) => i));
                    }

                    setPreviewGroups(groups);
                    setSelectedPreviewIndices(newSelection);
                    setStatus('reviewing');
                } else if (groups.length === 0) {
                    setPreviewGroups(null);
                    if (currentStatus === 'reviewing') setStatus('idle');
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        // Initial load from storage
        chrome.storage.session.get('suggestionCache').then(async (data) => {
            if (data && Array.isArray(data.suggestionCache)) {
                // Simulate change event to reuse logic
                handleStorageChange({
                    suggestionCache: { newValue: data.suggestionCache, oldValue: undefined }
                }, 'session');
            }
        });

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, [scanUngrouped, convertCacheToGroups, selectedPreviewIndices]); // Added selectedPreviewIndices dependency for smart preservation

    const generateGroups = async () => {
        setStatus('processing');
        setError(null);
        setProgress(null);
        setPreviewGroups(null);

        try {
            // Re-populate tab map for previews
            await scanUngrouped();

            // Connect to background
            const port = chrome.runtime.connect({ name: 'tab-grouper' });
            portRef.current = port;

            port.onMessage.addListener((msg: TabGroupResponse) => {
                if (msg.type === 'INITIALIZING') {
                    setStatus('initializing');
                } else if (msg.type === 'PROGRESS') {
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

            const window = await chrome.windows.getCurrent();
            if (window.id) {
                port.postMessage({ type: 'START_GROUPING', windowId: window.id });
            } else {
                throw new Error("Could not determine current window ID");
            }

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
                        if (group.existingGroupId && group.existingGroupId > 0) {
                            try {
                                // Add to existing group
                                await chrome.tabs.group({
                                    tabIds: validTabIds as [number, ...number[]],
                                    groupId: group.existingGroupId
                                });
                            } catch (e: any) {
                                // Check for specific error message regarding missing group
                                if (e.message && e.message.includes("No group with id")) {
                                    // Fallback: Create new group instead
                                    const groupId = await chrome.tabs.group({ tabIds: validTabIds as [number, ...number[]] });
                                    await chrome.tabGroups.update(groupId, { title: group.groupName });
                                } else {
                                    throw e;
                                }
                            }
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

            // We do NOT reject unselected groups anymore, per "just unselect" instruction.
            // They remain available for future grouping.
        } catch (err: any) {
            setError(err.message || "Failed to apply groups.");
            setStatus('error');
        }
    };

    const cancelGroups = () => {
        // Just clear the preview, do NOT reject suggestions (allow them to specific later)
        // User requested: "in unselect, just unselect, don't regenerate"
        setPreviewGroups(null);
        setStatus('idle');
    };

    const rejectGroup = () => {
        // User requested: "Change the logic about rejection, don't reject, change to re-generate."
        // This implies 'X' on a group means "I don't like this, try again".
        // Use generateGroups() to trigger a fresh analysis.

        // Optimistic UI update: Remove the group from view immediately while we re-generate?
        // Actually, generateGroups() clears previewGroups immediately anyway.
        // So we just call generateGroups().
        generateGroups();
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

    const setAllGroupsSelected = (selected: boolean) => {
        if (!previewGroups) return;
        if (selected) {
            setSelectedPreviewIndices(new Set(previewGroups.map((_, i) => i)));
        } else {
            setSelectedPreviewIndices(new Set());
        }
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
        ungroupedCount,
        isBackgroundProcessing,
        generateGroups,
        applyGroups,
        cancelGroups,
        rejectGroup,
        toggleGroupSelection,
        setAllGroupsSelected
    };
};

