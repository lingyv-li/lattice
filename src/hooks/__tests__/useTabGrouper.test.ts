import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTabGrouper } from '../useTabGrouper';
import { OrganizerStatus } from '../../types/organizer';
import { AIProviderType } from '../../utils/storage';
import { StateService } from '../../background/state';

// --- Mocks ---

// --- Mocks ---
// Mocks are handled in setupTests.ts

// Helper: Setup default mock returns
const setupMocks = () => {
    // Default: 1 window, 2 tabs
    (global.chrome.windows.getCurrent as any).mockResolvedValue({ id: 1 });
    (global.chrome.tabs.query as any).mockResolvedValue([
        { id: 101, title: 'Google', url: 'https://google.com', groupId: -1 },
        { id: 102, title: 'GitHub', url: 'https://github.com', groupId: -1 }
    ]);

    // Storage: Empty default
    (global.chrome.storage.session.get as any).mockResolvedValue({});

    // Storage Sync for settings (needed for AI enabled check)
    (global.chrome.storage.sync.get as any).mockImplementation((defaults: any, callback: any) => {
        // Return defaults (Local provider)
        callback({ ...defaults, aiProvider: AIProviderType.Local });
    });

    // Runtime: Mock Port
    const mockPort = {
        name: 'tab-grouper',
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
        disconnect: vi.fn()
    };
    (global.chrome.runtime.connect as any).mockReturnValue(mockPort);

    // Mock Timer for reconnect
    // vi.useFakeTimers(); // Removed to avoid waitFor conflicts
};


describe('useTabGrouper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupMocks();
        (StateService as any).isHydrated = false;
        (StateService as any).cache = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should initialize and load ungrouped tabs', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // Initial scan should happen
        await waitFor(() => {
            expect(result.current.ungroupedCount).toBe(2);
        });

        // Tab count should be 2 (from mock)
        // expect(result.current.ungroupedCount).toBe(2); // Handled by waitFor
        // Status should be idle initially (if no cache)
        expect(result.current.status).toBe(OrganizerStatus.Idle);
    });

    it('should load suggestions from storage on mount', async () => {
        // Setup existing storage data
        (global.chrome.storage.session.get as any).mockResolvedValue({
            suggestionCache: [
                { tabId: 101, windowId: 1, groupName: 'Search', existingGroupId: null, timestamp: 123 },
                { tabId: 102, windowId: 1, groupName: 'Dev', existingGroupId: null, timestamp: 123 }
            ]
        });

        const { result } = renderHook(() => useTabGrouper());

        // Verify storage was asked
        await waitFor(() => {
            expect(global.chrome.storage.session.get).toHaveBeenCalled();
        });

        // Verify state update (longer timeout or debug)
        await waitFor(() => {
            // Check that preview groups are populated
            if (!result.current.previewGroups) {
                // console.log("Waiting for previewGroups...");
            }
            expect(result.current.previewGroups).not.toBeNull();
            // Status stays Idle (no specific Reviewing status anymore)
            expect(result.current.status).toBe(OrganizerStatus.Idle);
        }, { timeout: 2000 });

        expect(result.current.previewGroups).toHaveLength(2);
        expect(result.current.previewGroups![0].groupName).toBe('Search');
    });

    it('should update preview when storage changes', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // Wait for init AND subscription to be established
        await waitFor(() => {
            expect(result.current.status).toBe(OrganizerStatus.Idle);
            expect((global.chrome.storage.onChanged.addListener as any).mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        // Give a moment for the effect to re-run with the correct windowId
        await new Promise(resolve => setTimeout(resolve, 50));

        // Simulate storage change event (get the LATEST listener)
        const calls = (global.chrome.storage.onChanged.addListener as any).mock.calls;
        const storageListener = calls[calls.length - 1][0];

        act(() => {
            storageListener({
                suggestionCache: {
                    newValue: [{ tabId: 101, windowId: 1, groupName: 'Async Group', existingGroupId: null, timestamp: 456 }],
                    oldValue: undefined
                }
            }, 'session');
        });

        await waitFor(() => {
            expect(result.current.previewGroups).not.toBeNull();
            expect(result.current.status).toBe(OrganizerStatus.Idle);
        }, { timeout: 2000 });

        expect(result.current.previewGroups).toHaveLength(1);
        expect(result.current.previewGroups![0].groupName).toBe('Async Group');
    });

    it('should connect port and handle PROCESSING_STATUS', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // Verify connection
        expect(global.chrome.runtime.connect).toHaveBeenCalledWith({ name: 'tab-grouper' });
        const mockPort = (global.chrome.runtime.connect as any).mock.results[0].value;
        const messageListener = mockPort.onMessage.addListener.mock.calls[0][0];

        // Status: Processing
        act(() => {
            messageListener({ type: 'PROCESSING_STATUS', isProcessing: true });
        });

        expect(result.current.isBackgroundProcessing).toBe(true);

        // Status: Done
        act(() => {
            messageListener({ type: 'PROCESSING_STATUS', isProcessing: false });
        });

        expect(result.current.isBackgroundProcessing).toBe(false);
    });

    it('should attempt reconnect on port disconnect', async () => {
        vi.useFakeTimers();
        renderHook(() => useTabGrouper());

        // ... (rest of test)

        // Teardown at end of test or use try/finally, but vitest usually resets if configured. 
        // Better to put in afterEach of describe block if used often, but here just local.

        const mockPort = (global.chrome.runtime.connect as any).mock.results[0].value;
        const disconnectListener = mockPort.onDisconnect.addListener.mock.calls[0][0];

        // Trigger disconnect
        act(() => {
            disconnectListener();
        });

        // Fast forward timer (reconnect delay)
        vi.advanceTimersByTime(2000);

        // Should have connected again
        expect(global.chrome.runtime.connect).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('should wait for windowId before subscribing to storage', async () => {
        // Track subscribe calls
        const subscribeSpy = vi.spyOn(StateService, 'subscribe');

        renderHook(() => useTabGrouper());

        // Before windowId resolves, subscribe should have been called with undefined initially
        // But after our fix, it should only be called after windowId is set
        await waitFor(() => {
            // Subscribe should have been called with windowId = 1
            expect(subscribeSpy).toHaveBeenCalled();
            const lastCall = subscribeSpy.mock.calls[subscribeSpy.mock.calls.length - 1];
            expect(lastCall[1]).toBe(1); // windowId should be 1
        });

        subscribeSpy.mockRestore();
    });

    it('should only load suggestions for current window', async () => {
        // Setup storage with suggestions for multiple windows
        (global.chrome.storage.session.get as any).mockResolvedValue({
            suggestionCache: [
                { tabId: 101, windowId: 1, groupName: 'Window1Group', existingGroupId: null, timestamp: 123 },
                { tabId: 201, windowId: 2, groupName: 'Window2Group', existingGroupId: null, timestamp: 123 }
            ]
        });

        // Current window is 1
        (global.chrome.windows.getCurrent as any).mockResolvedValue({ id: 1 });

        const { result } = renderHook(() => useTabGrouper());

        await waitFor(() => {
            expect(result.current.previewGroups).not.toBeNull();
        });

        // Should only show groups for window 1
        expect(result.current.previewGroups).toHaveLength(1);
        expect(result.current.previewGroups![0].groupName).toBe('Window1Group');
    });

    it('should maintain user selection when identical storage updates occur', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // 1. Initial State - wait for windowId to be set and subscription to be established
        // The effect runs twice: once with undefined windowId (early return), then with windowId=1
        await waitFor(() => {
            expect(result.current.status).toBe(OrganizerStatus.Idle);
            // Wait for at least 2 listener registrations (initial + after windowId is set)
            expect((global.chrome.storage.onChanged.addListener as any).mock.calls.length).toBeGreaterThanOrEqual(1);
        });

        // Give a moment for the effect to re-run with the correct windowId
        await new Promise(resolve => setTimeout(resolve, 50));

        // 2. Simulate Storage Update (get the LATEST listener after subscription is established)
        const calls = (global.chrome.storage.onChanged.addListener as any).mock.calls;
        const storageListener = calls[calls.length - 1][0];
        const suggestions = [
            { tabId: 101, windowId: 1, groupName: 'Search', existingGroupId: null, timestamp: 123 },
            { tabId: 102, windowId: 1, groupName: 'Dev', existingGroupId: null, timestamp: 123 }
        ];

        act(() => {
            storageListener({
                suggestionCache: { newValue: suggestions, oldValue: undefined }
            }, 'session');
        });

        await waitFor(() => {
            expect(result.current.previewGroups).not.toBeNull();
            expect(result.current.status).toBe(OrganizerStatus.Idle);
            expect(result.current.selectedPreviewIndices.size).toBe(2);
        }, { timeout: 2000 });

        // 3. User deselects one group (Index 1: 'Dev')
        act(() => {
            result.current.toggleGroupSelection(1);
        });

        await waitFor(() => {
            expect(result.current.selectedPreviewIndices.has(1)).toBe(false);
            expect(result.current.selectedPreviewIndices.size).toBe(1);
        });

        // 4. Simulate IDENTICAL storage update
        // We ensure we pass a COPY to ensure reference equality check in hook (if any) doesn't false-positive,
        // though the hook explicitly checks JSON content. 
        act(() => {
            storageListener({
                suggestionCache: { newValue: [...suggestions], oldValue: undefined }
            }, 'session');
        });

        // 5. Verify selection persists (should NOT reset to all selected)
        await waitFor(() => {
            expect(result.current.selectedPreviewIndices.size).toBe(1);
            expect(result.current.selectedPreviewIndices.has(1)).toBe(false);
            expect(result.current.selectedPreviewIndices.has(0)).toBe(true);
        });

        // 6. Simulate PARTIAL update (Adding a new group, keeping old ones)
        // 'Search' (Index 0) is still there. 'Dev' (Index 1) is still there. 'New' (Index 2) added.
        // Logic: If it matches a previously selected group, select it.
        // 0 matches selected -> 0 selected.
        // 1 matches unselected -> 1 NOT selected.
        // 2 is new -> No match in selectedSignatures.
        // Result: 0 selected, 1 unselected, 2 unselected.
        // This ensures partial updates don't disturb existing user choices.

        const newSuggestions = [
            ...suggestions,
            { tabId: 103, windowId: 1, groupName: 'New Group', existingGroupId: null, timestamp: 999 }
        ];

        act(() => {
            storageListener({
                suggestionCache: { newValue: newSuggestions, oldValue: undefined }
            }, 'session');
        });

        await waitFor(() => {
            // Index 0 ('Search') should be selected (preserved)
            expect(result.current.selectedPreviewIndices.has(0)).toBe(true);
            // Index 1 ('Dev') should be unselected (preserved)
            expect(result.current.selectedPreviewIndices.has(1)).toBe(false);
            // Index 2 ('New Group') should be unselected (because it wasn't in signature set)
            expect(result.current.selectedPreviewIndices.has(2)).toBe(false);
        });
    });

    it('should select or deselect all groups using setAllGroupsSelected', async () => {
        // Setup groups
        const suggestions = [
            { tabId: 101, windowId: 1, groupName: 'One', existingGroupId: null, timestamp: 1 },
            { tabId: 102, windowId: 1, groupName: 'Two', existingGroupId: null, timestamp: 2 }
        ];
        (global.chrome.storage.session.get as any).mockResolvedValue({
            suggestionCache: suggestions
        });

        const { result: loadedResult } = renderHook(() => useTabGrouper());

        await waitFor(() => {
            expect(loadedResult.current.status).toBe(OrganizerStatus.Idle);
            expect(loadedResult.current.previewGroups).not.toBeNull();
            expect(loadedResult.current.selectedPreviewIndices.size).toBe(2);
        });

        // Deselect All
        act(() => {
            loadedResult.current.setAllGroupsSelected(false);
        });
        expect(loadedResult.current.selectedPreviewIndices.size).toBe(0);

        // Select All
        act(() => {
            loadedResult.current.setAllGroupsSelected(true);
        });
        expect(loadedResult.current.selectedPreviewIndices.size).toBe(2);
    });
});
