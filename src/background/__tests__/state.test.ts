
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateService } from '../state';
import { TabSuggestionCache } from '../../types/tabGrouper';

// Mock chrome.storage.session
const mockStorage: Record<string, any> = {};

const mockSession = {
    get: vi.fn((keys: string | string[] | null) => {
        if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        return Promise.resolve(mockStorage);
    }),
    set: vi.fn((items: Record<string, any>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
        if (typeof keys === 'string') {
            delete mockStorage[keys];
        } else if (Array.isArray(keys)) {
            keys.forEach(k => delete mockStorage[k]);
        }
        return Promise.resolve();
    })
};

// Setup global chrome mock
global.chrome = {
    storage: {
        session: mockSession
    }
} as any;

describe('StateService', () => {
    beforeEach(() => {
        // Reset state
        vi.clearAllMocks();
        // Clear mock storage
        for (const key in mockStorage) delete mockStorage[key];

        // Reset private static state of StateService if possible? 
        // Since it's a static class with private fields, we can't easily reset it without exposing a method.
        // But we can call clearCache() which should reset it.
    });

    it('should start with empty cache', async () => {
        // Force reset
        await StateService.clearCache();
        const cache = await StateService.getSuggestionCache();
        expect(cache.size).toBe(0);
    });

    it('should hydrate from storage', async () => {
        const testData: TabSuggestionCache[] = [
            { tabId: 1, groupName: 'Test', existingGroupId: null, timestamp: 123 }
        ];
        mockStorage['suggestionCache'] = testData;

        // We need to force re-hydration. 
        // Since we can't access `isHydrated`, we rely on `clearCache` clearing the map, 
        // but `hydrate` checks `isHydrated`.
        // Ideally we'd have a `reset` method for testing, or `clearCache` sets `isHydrated = true` with empty map.
        // Actually `hydrate` is only called if `!isHydrated`.
        // If we want to test hydration, we must ensure `isHydrated` is false.
        // But `clearCache` sets it to true.
        // This makes testing "first load" hard in a static singleton test without isolation.
        // However, `hydrate()` logic: if storage has data, it uses it.

        // Let's try to simulate a new "session" by hacking the private field if needed, 
        // or just accept we test behavior.

        // If we manually call hydrate, it might return early.
        // But for this test file, each test runs in same context? Yes.
        // We might need to user `vi.spyOn` or just assume `clearCache` works for clearing.

        // Actually, let's modify StateService to allow resetting for tests? 
        // Or just trust `clearCache`.

        // Wait, if `mockStorage` has data, `hydrate` will read it?
        // Only if `isHydrated` is false.
        // But `clearCache` sets `isHydrated = true`.
        // So we can't easily test "startup hydration" after the first test runs `clearCache`.

        // Workaround: We can't easily reset the private boolean.
        // Let's rely on `getSuggestionCache` to behave correctly given the *current* state.

        // Actually, we can cast to any to reset private fields for testing
        (StateService as any).isHydrated = false;
        (StateService as any).cache = null;

        const cache = await StateService.getSuggestionCache();
        expect(cache.size).toBe(1);
        expect(cache.get(1)).toEqual(testData[0]);
        expect(mockSession.get).toHaveBeenCalledWith('suggestionCache');
    });

    it('should update and persist suggestion', async () => {
        await StateService.clearCache();

        const suggestion: TabSuggestionCache = {
            tabId: 101,
            groupName: 'New Group',
            existingGroupId: null,
            timestamp: Date.now()
        };

        await StateService.updateSuggestion(suggestion);

        const cache = await StateService.getSuggestionCache();
        expect(cache.get(101)).toEqual(suggestion);

        expect(mockSession.set).toHaveBeenCalled();
        expect(mockStorage['suggestionCache']).toHaveLength(1);
        expect(mockStorage['suggestionCache'][0]).toEqual(suggestion);
    });

    it('should remove suggestion', async () => {
        await StateService.clearCache();
        const suggestion: TabSuggestionCache = {
            tabId: 202,
            groupName: 'Delete Me',
            existingGroupId: null,
            timestamp: Date.now()
        };
        await StateService.updateSuggestion(suggestion);

        const removed = await StateService.removeSuggestion(202);
        expect(removed).toBe(true);

        const cache = await StateService.getSuggestionCache();
        expect(cache.has(202)).toBe(false);
        expect(mockStorage['suggestionCache']).toHaveLength(0);
    });

    it('should return false when removing non-existent suggestion', async () => {
        await StateService.clearCache();
        const removed = await StateService.removeSuggestion(999);
        expect(removed).toBe(false);
    });
});
