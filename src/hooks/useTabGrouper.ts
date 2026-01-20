import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TabGroupSuggestion, TabSuggestionCache, TabGroupMessageType } from '../types/tabGrouper';
import { OrganizerStatus } from '../types/organizer';
import { applyTabGroup } from '../utils/tabs';
import { AIProviderType, SettingsStorage } from '../utils/storage';

import { StateService } from '../background/state';
import { WindowSnapshot } from '../utils/snapshots';
import { debounce } from '../utils/debounce';

export type { TabGroupSuggestion };

export const useTabGrouper = () => {
    // "Interaction Status" tracks explicit user actions (Applying) or results (Success/Error)
    const [interactionStatus, setInteractionStatus] = useState<OrganizerStatus>(OrganizerStatus.Idle);
    const [error, setError] = useState<string | null>(null);
    const [previewGroups, setPreviewGroups] = useState<(TabGroupSuggestion & { existingGroupId?: number | null })[] | null>(null);
    const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
    const [snapshot, setSnapshot] = useState<WindowSnapshot | null>(null);
    const [isBackgroundProcessing, setBackgroundProcessing] = useState(false);
    const [currentWindowId, setCurrentWindowId] = useState<number | undefined>(undefined);
    const [aiEnabled, setAiEnabled] = useState(true);

    // Store port reference
    const portRef = useRef<chrome.runtime.Port | null>(null);

    // Derive unselected signatures from current state
    // Groups the user has "rejected" (unselected) - used to preserve selection across updates
    const newGroupCount = useMemo(() => {
        if (!previewGroups) return 0;
        return previewGroups.filter(g => !g.existingGroupId).length;
    }, [previewGroups]);

    const unselectedSignatures = useMemo(() => {
        if (!previewGroups) return new Set<string>();
        const result = new Set<string>();
        previewGroups.forEach((g, idx) => {
            if (!selectedPreviewIndices.has(idx)) {
                result.add(JSON.stringify(g));
            }
        });
        return result;
    }, [previewGroups, selectedPreviewIndices]);

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
        // Initial scan - intentionally sets state on mount
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

        // Debounce scanner to prevent excessive calls during rapid tab changes (e.g. session restore)
        const handleTabEvent = debounce(() => scanUngrouped(), 500);

        // Cast to any to satisfy specific event listener signatures (args are ignored)
        const listener = handleTabEvent as unknown as (...args: any[]) => void;

        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.onCreated.addListener(listener);
        chrome.tabs.onRemoved.addListener(listener);

        return () => {
            handleTabEvent.cancel();
            clearTimeout(reconnectTimeout);
            if (portRef.current) {
                portRef.current.disconnect();
            }
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.onCreated.removeListener(listener);
            chrome.tabs.onRemoved.removeListener(listener);
        };
    }, [scanUngrouped]);

    // Process suggestions and update state
    const processSuggestions = async (cache: Map<number, TabSuggestionCache>) => {
        const newValue = Array.from(cache.values());
        const snap = await scanUngrouped();

        let newGroups: (TabGroupSuggestion & { existingGroupId?: number | null })[] = [];
        if (newValue && Array.isArray(newValue) && newValue.length > 0) {
            newGroups = convertCacheToGroups(newValue, snap);
        }

        // Use functional updater to let React handle the diff.
        // If the new groups are identical to the previous, return the same reference (no re-render).
        setPreviewGroups(prevGroups => {
            const newHash = JSON.stringify(newGroups);
            const prevHash = JSON.stringify(prevGroups);

            if (newHash === prevHash) {
                return prevGroups; // No change, return same reference
            }

            if (newGroups.length > 0) {
                // Compute new selection based on unselected signatures
                const newSelection = new Set<number>();

                newGroups.forEach((g, idx) => {
                    if (!unselectedSignatures.has(JSON.stringify(g))) {
                        newSelection.add(idx);
                    }
                });
                setSelectedPreviewIndices(newSelection);
                return newGroups;
            } else {
                return null;
            }
        });
    };

    // Stable ref for subscription - always points to latest processSuggestions
    const processSuggestionsRef = useRef(processSuggestions);
    useEffect(() => {
        processSuggestionsRef.current = processSuggestions;
    });

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
                processSuggestionsRef.current(cache);
            }
        });

        // Initial load for status
        StateService.getProcessingWindows().then(windows => {
            setBackgroundProcessing(windows.includes(currentWindowId));
        });

        // Subscribe to Suggestions AND Status
        const unsubscribe = StateService.subscribe(currentWindowId, (cache, isProcessing) => {
            processSuggestionsRef.current(cache);
            setBackgroundProcessing(isProcessing);
        });

        return () => {
            unsubscribe();
        };
    }, [currentWindowId, processSuggestionsRef]); // processSuggestions NOT a dependency - accessed via ref

    const applyGroups = async () => {
        if (!previewGroups) return;
        setInteractionStatus(OrganizerStatus.Applying);
        setError(null);

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
            setInteractionStatus(OrganizerStatus.Success);
            setPreviewGroups(null);
            setTimeout(() => setInteractionStatus(OrganizerStatus.Idle), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err) || "Failed to apply groups.");
            setInteractionStatus(OrganizerStatus.Idle);
        }
    };
    const applyGroup = async (index: number) => {
        if (!previewGroups || !previewGroups[index]) return;
        setInteractionStatus(OrganizerStatus.Applying);
        setError(null);

        try {
            const currentWindow = await chrome.windows.getCurrent();
            const group = previewGroups[index];

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
            setInteractionStatus(OrganizerStatus.Success);
            // We rely on background update to refresh suggestions
            setTimeout(() => setInteractionStatus(OrganizerStatus.Idle), 1000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err) || "Failed to apply group.");
            setInteractionStatus(OrganizerStatus.Idle);
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
        setError(null);
        portRef.current.postMessage({ type: TabGroupMessageType.RegenerateSuggestions, windowId: currentWindowId });
        setPreviewGroups(null); // Clear optimistic
        setBackgroundProcessing(true); // Show analyzing state immediately
    }, [currentWindowId]);

    const triggerProcessing = useCallback(() => {
        if (!portRef.current || !currentWindowId) return;
        setError(null);
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
        status: interactionStatus,
        error,
        previewGroups,
        setPreviewGroups,
        selectedPreviewIndices,
        snapshot,
        isBackgroundProcessing,
        applyGroups,
        applyGroup,
        toggleGroupSelection,
        setAllGroupsSelected,
        regenerateSuggestions,
        triggerProcessing,
        aiEnabled,
        newGroupCount
    };
};
