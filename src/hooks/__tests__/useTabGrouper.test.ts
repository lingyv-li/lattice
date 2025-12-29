import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTabGrouper } from '../useTabGrouper';

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
        expect(result.current.status).toBe('idle');
    });

    it('should load suggestions from storage on mount', async () => {
        // Setup existing storage data
        (global.chrome.storage.session.get as any).mockResolvedValue({
            suggestionCache: [
                { tabId: 101, groupName: 'Search', existingGroupId: null, timestamp: 123 },
                { tabId: 102, groupName: 'Dev', existingGroupId: null, timestamp: 123 }
            ]
        });

        const { result } = renderHook(() => useTabGrouper());

        // Verify storage was asked
        await waitFor(() => {
            expect(global.chrome.storage.session.get).toHaveBeenCalled();
        });

        // Verify state update (longer timeout or debug)
        await waitFor(() => {
            if (result.current.status !== 'reviewing') {
                // console.log("Current status:", result.current.status);
            }
            expect(result.current.status).toBe('reviewing');
        }, { timeout: 2000 });

        expect(result.current.previewGroups).toHaveLength(2);
        expect(result.current.previewGroups![0].groupName).toBe('Search');
    });

    it('should update preview when storage changes', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // Wait for init
        await waitFor(() => expect(result.current.status).toBe('idle'));

        // Simulate storage change event
        const storageListener = (global.chrome.storage.onChanged.addListener as any).mock.calls[0][0];

        act(() => {
            storageListener({
                suggestionCache: {
                    newValue: [{ tabId: 101, groupName: 'Async Group', existingGroupId: null, timestamp: 456 }],
                    oldValue: undefined
                }
            }, 'session');
        });

        await waitFor(() => {
            expect(result.current.status).toBe('reviewing');
        });

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

    it('should send START_GROUPING message on generateGroups', async () => {
        const { result } = renderHook(() => useTabGrouper());

        // We need to capture the transient port created in generateGroups (it creates a NEW one for the session)
        // Wait, looking at implementation: generateGroups creates *another* port for the "Active Session"? 
        // Yes, line 149 in implementation.

        await act(async () => {
            // We need to ensure tabs are loaded first so we have tabs to group? 
            // Mock implies we have tabs.
            await result.current.generateGroups();
        });

        // Current implementation creates a new port, posts START_GROUPING
        const calls = (global.chrome.runtime.connect as any).mock.calls;
        // 1st call: useEffect listener
        // 2nd call: generateGroups transient port
        expect(calls.length).toBeGreaterThanOrEqual(2);

        const transientPort = (global.chrome.runtime.connect as any).mock.results[calls.length - 1].value;
        expect(transientPort.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'START_GROUPING', windowId: 1 })
        );

        expect(result.current.status).toBe('processing');
    });
});
