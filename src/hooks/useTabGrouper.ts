import { useState, useEffect, useRef, useCallback } from 'react';
import { TabGroupMessageType, TabGroupSuggestion, TabSuggestionCache } from '../types/tabGrouper';
import { OrganizerStatus } from '../types/organizer';
import { applyTabGroup } from '../utils/tabs';
import { AIProviderType, SettingsStorage } from '../utils/storage';

import { StateService } from '../background/state';
import { WindowSnapshot } from '../utils/snapshots';
export type { TabGroupSuggestion };

export const useTabGrouper = () => {
    const [status, setStatus] = useState<OrganizerStatus>(OrganizerStatus.Idle);
    const [error, setError] = useState<string | null>(null);
    const [previewGroups, setPreviewGroups] = useState<(TabGroupSuggestion & { existingGroupId?: number | null })[] | null>(null);
    const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
    const [snapshot, setSnapshot] = useState<WindowSnapshot | null>(null);
    const [isBackgroundProcessing, setBackgroundProcessing] = useState(false);
    const [currentWindowId, setCurrentWindowId] = useState<number | undefined>(undefined);
    const [aiEnabled, setAiEnabled] = useState(true);

    // Store port reference
    const portRef = useRef<chrome.runtime.Port | null>(null);
    // Store current previews in ref to access inside listeners without re-subscribing
    const previewGroupsRef = useRef<typeof previewGroups>(null);
    // Store status in ref to access inside listeners without re-subscribing
    const statusRef = useRef<OrganizerStatus>(status);

    // Check settings for enabled state
    useEffect(() => {
        SettingsStorage.get().then(s => {
            setAiEnabled(s.aiProvider !== AIProviderType.None);
        });

        const unsubscribe = SettingsStorage.subscribe((changes) => {
            if (changes.aiProvider) {
                setAiEnabled(changes.aiProvider.newValue !== AIProviderType.None);
            }
        });

        return () => unsubscribe();
    }, []);

    // Update refs when state changes
    useEffect(() => {
        previewGroupsRef.current = previewGroups;
    }, [previewGroups]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);



    // Convert cached suggestions to preview groups
    const convertCacheToGroups = useCallback((cache: TabSuggestionCache[], snap: WindowSnapshot) => {
        const groupMap = new Map<string, TabGroupSuggestion & { existingGroupId?: number | null }>();

        for (const cached of cache) {
            // Only include if tab still exists in our snapshot and has a group name
            if (!snap.hasTab(cached.tabId) || !cached.groupName) continue;

            const key = cached.existingGroupId
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

    // Scan ungrouped tabs and update snapshot
    const scanUngrouped = useCallback(async () => {
        const snap = await WindowSnapshot.fetch(chrome.windows.WINDOW_ID_CURRENT);
        setSnapshot(snap);
        return snap;
    }, []);

    useEffect(() => {
        // Initial scan
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
                    // Attempt reconnect
                    reconnectTimeout = setTimeout(connectPort, 2000);
                });



                // Request current status and trigger sync
                chrome.windows.getCurrent().then(win => {
                    if (win.id && portRef.current) {
                        port.postMessage({ type: TabGroupMessageType.TriggerProcessing, windowId: win.id });
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

    // Process suggestions and update state
    const processSuggestions = useCallback(async (cache: Map<number, TabSuggestionCache>) => {
        const newValue = Array.from(cache.values());
        const snap = await scanUngrouped();

        let groups: (TabGroupSuggestion & { existingGroupId?: number | null })[] = [];
        if (newValue && Array.isArray(newValue) && newValue.length > 0) {
            groups = convertCacheToGroups(newValue, snap);
        }

        // Check if groups actually changed to prevent resetting selection
        // Use ref to compare against current state without adding dependency
        const currentGroups = previewGroupsRef.current;
        if (currentGroups && JSON.stringify(groups) === JSON.stringify(currentGroups)) {
            return;
        }

        const currentStatus = statusRef.current;
        if (groups.length > 0 && currentStatus !== OrganizerStatus.Applying) {
            // Smart Selection Preservation:
            // Logic: Default to selected, unless it matches a group the user previously ignored.
            const newSelection = new Set<number>();
            const unselectedSignatures = new Set<string>();

            if (currentGroups) {
                currentGroups.forEach((g, idx) => {
                    if (!selectedPreviewIndices.has(idx)) {
                        unselectedSignatures.add(JSON.stringify(g));
                    }
                });
            }

            groups.forEach((g, idx) => {
                // If it's NOT in the unselected set -> Select it.
                if (!unselectedSignatures.has(JSON.stringify(g))) {
                    newSelection.add(idx);
                }
            });

            setPreviewGroups(groups);
            setSelectedPreviewIndices(newSelection);
        } else if (groups.length === 0) {
            setPreviewGroups(null);
        }
    }, [scanUngrouped, convertCacheToGroups, selectedPreviewIndices]);

    // --- Current Window ID ---
    useEffect(() => {
        chrome.windows.getCurrent().then(win => setCurrentWindowId(win.id));
    }, []);

    // --- Storage Listener for Suggestions & Status ---
    useEffect(() => {
        if (currentWindowId === undefined) return; // Wait for window ID

        // Initial load for current window
        StateService.getSuggestionCache(currentWindowId).then(cache => {
            if (cache.size > 0) {
                processSuggestions(cache);
            }
        });

        // Initial load for status
        StateService.getProcessingWindows().then(windows => {
            setBackgroundProcessing(windows.includes(currentWindowId));
        });

        // Subscribe to Suggestions AND Status
        const unsubscribe = StateService.subscribe(currentWindowId, (cache, isProcessing) => {
            processSuggestions(cache);
            setBackgroundProcessing(isProcessing);
        });

        return () => {
            unsubscribe();
        };
    }, [processSuggestions, currentWindowId]);

    const applyGroups = async () => {
        if (!previewGroups) return;
        setStatus(OrganizerStatus.Applying);

        try {
            const currentWindow = await chrome.windows.getCurrent();

            for (let i = 0; i < previewGroups.length; i++) {
                if (!selectedPreviewIndices.has(i)) continue;

                const group = previewGroups[i];
                if (group.tabIds.length > 0) {
                    const validTabIds = group.tabIds.filter(id => snapshot?.hasTab(id));

                    if (validTabIds.length > 0) {
                        await applyTabGroup(
                            validTabIds,
                            group.groupName,
                            group.existingGroupId,
                            currentWindow.id!
                        );
                    }
                }
            }
            setStatus(OrganizerStatus.Success);
            setPreviewGroups(null);
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);

            // We do NOT reject unselected groups anymore, per "just unselect" instruction.
            // They remain available for future grouping.
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err) || "Failed to apply groups.");
            setStatus(OrganizerStatus.Error);
        }
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

    const regenerateSuggestions = useCallback(() => {
        if (!portRef.current || !currentWindowId) return;
        portRef.current.postMessage({ type: TabGroupMessageType.RegenerateSuggestions, windowId: currentWindowId });
        setPreviewGroups(null); // Clear optimistic
        setBackgroundProcessing(true); // Show analyzing state immediately
    }, [currentWindowId]);

    const triggerProcessing = useCallback(() => {
        if (!portRef.current || !currentWindowId) return;
        portRef.current.postMessage({ type: TabGroupMessageType.TriggerProcessing, windowId: currentWindowId });
        setBackgroundProcessing(true); // Show analyzing state immediately
    }, [currentWindowId]);

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
        previewGroups,
        setPreviewGroups,
        selectedPreviewIndices,
        snapshot,
        isBackgroundProcessing,
        applyGroups,
        toggleGroupSelection,
        setAllGroupsSelected,
        regenerateSuggestions,
        triggerProcessing,
        aiEnabled
    };
};
