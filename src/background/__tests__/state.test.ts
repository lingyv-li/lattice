import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateService } from '../state';
import { TabSuggestionCache } from '../../types/tabGrouper';
import { WindowSnapshot } from '../../utils/snapshots';

// Mock chrome.storage.session
const mockStorage: Record<string, unknown> = {};

// Mock listeners
const listeners: Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = new Set();
const mockOnChanged = {
    addListener: vi.fn(cb => listeners.add(cb)),
    removeListener: vi.fn(cb => listeners.delete(cb))
};

const notifyListeners = (changes: Record<string, chrome.storage.StorageChange>) => {
    listeners.forEach(cb => cb(changes, 'session'));
};

const mockSession = {
    get: vi.fn((keys: string | string[] | null) => {
        if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        if (Array.isArray(keys)) {
            const res: Record<string, unknown> = {};
            keys.forEach(k => {
                res[k] = mockStorage[k];
            });
            return Promise.resolve(res);
        }
        return Promise.resolve(mockStorage);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [key, value] of Object.entries(items)) {
            changes[key] = { newValue: value };
        }
        Object.assign(mockStorage, items);
        notifyListeners(changes);
        return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        const keyList = Array.isArray(keys) ? keys : [keys];

        keyList.forEach(k => {
            changes[k] = { newValue: undefined };
            delete mockStorage[k];
        });

        notifyListeners(changes);
        return Promise.resolve();
    })
};

// Setup global chrome mock
global.chrome = {
    storage: {
        session: mockSession,
        onChanged: mockOnChanged
    }
} as unknown as typeof chrome;

const WINDOW_ID = 1;

describe('StateService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key in mockStorage) delete mockStorage[key];
    });

    it('should start with empty cache', async () => {
        await StateService.clearCache();
        const cache = await StateService.getSuggestionCache(WINDOW_ID);
        expect(cache.size).toBe(0);
    });

    it('should hydrate from storage', async () => {
        const testData: TabSuggestionCache[] = [
            {
                tabId: 1,
                windowId: WINDOW_ID,
                groupName: 'Test',
                existingGroupId: null,
                timestamp: 123
            }
        ];
        mockStorage['suggestionCache'] = testData;

        // Reset private state for testing
        // @ts-expect-error - Accessing private property
        StateService.isHydrated = false;
        // @ts-expect-error - Accessing private property
        StateService.cache = null;

        const cache = await StateService.getSuggestionCache(WINDOW_ID);
        expect(cache.size).toBe(1);
        expect(cache.get(1)).toEqual(testData[0]);
        expect(mockSession.get).toHaveBeenCalledWith(['suggestionCache', 'windowSnapshots', 'processingWindowIds', 'duplicateCounts']);
    });

    it('should update and persist suggestions', async () => {
        await StateService.clearCache();

        const suggestion: TabSuggestionCache = {
            tabId: 101,
            windowId: WINDOW_ID,
            groupName: 'New Group',
            existingGroupId: null,
            timestamp: Date.now()
        };

        await StateService.updateSuggestions([suggestion]);

        const cache = await StateService.getSuggestionCache(WINDOW_ID);
        expect(cache.get(101)).toEqual(suggestion);

        expect(mockSession.set).toHaveBeenCalled();
        expect(mockStorage['suggestionCache']).toHaveLength(1);
        // @ts-expect-error - Accessing mock storage with dynamic keys
        expect(mockStorage['suggestionCache'][0]).toEqual(suggestion);
    });

    it('should remove suggestion', async () => {
        await StateService.clearCache();
        const suggestion: TabSuggestionCache = {
            tabId: 202,
            windowId: WINDOW_ID,
            groupName: 'Delete Me',
            existingGroupId: null,
            timestamp: Date.now()
        };
        await StateService.updateSuggestions([suggestion]);

        const removed = await StateService.removeSuggestion(202);
        expect(removed).toBe(true);

        const cache = await StateService.getSuggestionCache(WINDOW_ID);
        expect(cache.has(202)).toBe(false);
        expect(mockStorage['suggestionCache']).toHaveLength(0);
    });

    it('should return false when removing non-existent suggestion', async () => {
        await StateService.clearCache();
        const removed = await StateService.removeSuggestion(999);
        expect(removed).toBe(false);
    });

    it('should notify listeners on update', async () => {
        await StateService.clearCache();
        const listener = vi.fn();
        const unsubscribe = StateService.subscribe(WINDOW_ID, listener);

        const suggestion: TabSuggestionCache = {
            tabId: 303,
            windowId: WINDOW_ID,
            groupName: 'Listener Test',
            existingGroupId: null,
            timestamp: Date.now()
        };

        // Update
        await StateService.updateSuggestions([suggestion]);
        expect(listener).toHaveBeenCalledTimes(1);

        // Remove
        await StateService.removeSuggestion(303);
        expect(listener).toHaveBeenCalledTimes(2);

        // Clear
        await StateService.clearCache();
        expect(listener).toHaveBeenCalledTimes(3);

        // Unsubscribe
        unsubscribe();
        await StateService.updateSuggestions([suggestion]);
        expect(listener).toHaveBeenCalledTimes(3); // Should not increase
    });

    it('should get per-window cache', async () => {
        await StateService.clearCache();

        const suggestions: TabSuggestionCache[] = [
            { tabId: 1, windowId: 1, groupName: 'A', existingGroupId: null, timestamp: 1 },
            { tabId: 2, windowId: 2, groupName: 'B', existingGroupId: null, timestamp: 2 }
        ];

        await StateService.updateSuggestions(suggestions);

        const window1Cache = await StateService.getSuggestionCache(1);
        expect(window1Cache.size).toBe(1);
        expect(window1Cache.get(1)?.groupName).toBe('A');

        const window2Cache = await StateService.getSuggestionCache(2);
        expect(window2Cache.size).toBe(1);
        expect(window2Cache.get(2)?.groupName).toBe('B');
    });

    it('should store and retrieve window snapshots', async () => {
        await StateService.clearCache();
        const windowId = 123;
        const fingerprint = 'tab1:url1|tab2:url2';

        await StateService.updateWindowSnapshot(windowId, { fingerprint } as WindowSnapshot);

        const retrieved = await StateService.getWindowSnapshot(windowId);
        expect(retrieved).toBe(fingerprint);

        // Verify persistence
        // @ts-expect-error - Accessing mock storage with dynamic keys
        expect(mockStorage['windowSnapshots'][windowId]).toBe(fingerprint);
    });

    it('should hydrate snapshots from storage', async () => {
        const windowId = 789;
        const snapshot = 'persisted-snapshot';

        mockStorage['windowSnapshots'] = {
            [windowId]: snapshot
        };

        // Reset private state for testing
        // @ts-expect-error - Accessing private property
        StateService.isHydrated = false;
        // @ts-expect-error - Accessing private property
        StateService.snapshots = new Map();

        const retrieved = await StateService.getWindowSnapshot(windowId);
        expect(retrieved).toBe(snapshot);
    });

    it('should handle snapshot updates gracefully', async () => {
        const windowId = 999;
        await StateService.updateWindowSnapshot(windowId, { fingerprint: 'v1' } as WindowSnapshot);
        expect(await StateService.getWindowSnapshot(windowId)).toBe('v1');

        await StateService.updateWindowSnapshot(windowId, { fingerprint: 'v2' } as WindowSnapshot);
        expect(await StateService.getWindowSnapshot(windowId)).toBe('v2');
        // @ts-expect-error - Accessing mock storage with dynamic keys
        expect(mockStorage['windowSnapshots'][windowId]).toBe('v2');
    });

    it('should store and retrieve duplicate counts', async () => {
        await StateService.clearCache();
        const windowId = 555;

        expect(await StateService.getDuplicateCount(windowId)).toBe(0);

        await StateService.updateDuplicateCount(windowId, 5);
        expect(await StateService.getDuplicateCount(windowId)).toBe(5);

        // Verify persistence
        // @ts-expect-error - Accessing mock storage with dynamic keys
        expect(mockStorage['duplicateCounts'][windowId]).toBe(5);
    });

    it('should notify listeners on duplicate count change', async () => {
        await StateService.clearCache();
        const listener = vi.fn();
        const unsubscribe = StateService.subscribe(WINDOW_ID, listener);

        await StateService.updateDuplicateCount(WINDOW_ID, 3);

        expect(listener).toHaveBeenCalledTimes(1);
        // Arg 3 is duplicateCount
        expect(listener).toHaveBeenCalledWith(expect.any(Map), false, 3);

        unsubscribe();
    });
});
