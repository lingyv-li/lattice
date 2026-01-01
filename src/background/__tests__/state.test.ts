
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateService } from '../state';
import { TabSuggestionCache } from '../../types/tabGrouper';

// Mock chrome.storage.session
const mockStorage: Record<string, any> = {};

// Mock listeners
const listeners: Set<Function> = new Set();
const mockOnChanged = {
    addListener: vi.fn((cb) => listeners.add(cb)),
    removeListener: vi.fn((cb) => listeners.delete(cb))
};

const notifyListeners = (changes: any) => {
    listeners.forEach(cb => cb(changes, 'session'));
};

const mockSession = {
    get: vi.fn((keys: string | string[] | null) => {
        if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        return Promise.resolve(mockStorage);
    }),
    set: vi.fn((items: Record<string, any>) => {
        const changes: any = {};
        for (const [key, value] of Object.entries(items)) {
            changes[key] = { newValue: value };
        }
        Object.assign(mockStorage, items);
        notifyListeners(changes);
        return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
        const changes: any = {};
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
} as any;

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
            { tabId: 1, windowId: WINDOW_ID, groupName: 'Test', existingGroupId: null, timestamp: 123 }
        ];
        mockStorage['suggestionCache'] = testData;

        // Reset private state for testing
        (StateService as any).isHydrated = false;
        (StateService as any).cache = null;

        const cache = await StateService.getSuggestionCache(WINDOW_ID);
        expect(cache.size).toBe(1);
        expect(cache.get(1)).toEqual(testData[0]);
        expect(mockSession.get).toHaveBeenCalledWith(['suggestionCache', 'windowSnapshots']);
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
        const unsubscribe = StateService.subscribe(listener);

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
});
