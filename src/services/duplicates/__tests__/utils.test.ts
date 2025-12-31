
import { describe, it, expect } from 'vitest';
import { findDuplicates, countDuplicates, getTabsToRemove } from '../utils';

describe('duplicates utility', () => {
    const createTab = (overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
        id: 1,
        index: 0,
        pinned: false,
        highlighted: false,
        windowId: 1,
        active: false,
        incognito: false,
        selected: false,
        discarded: false,
        autoDiscardable: false,
        frozen: false,
        groupId: -1,
        ...overrides
    } as chrome.tabs.Tab);

    describe('findDuplicates', () => {
        it('should group tabs by normalized URL', () => {
            const tabs = [
                createTab({ id: 1, url: 'http://a.com' }),
                createTab({ id: 2, url: 'http://a.com/' }), // Normalized same
                createTab({ id: 3, url: 'http://b.com' })
            ];

            const result = findDuplicates(tabs);

            expect(result.size).toBe(2);
            expect(result.get('http://a.com')?.length).toBe(2);
            expect(result.get('http://b.com')?.length).toBe(1);
        });

        it('should ignore tabs without URL', () => {
            const tabs = [
                createTab({ id: 1, url: '' }),
                createTab({ id: 2 })
            ];
            const result = findDuplicates(tabs);
            expect(result.size).toBe(0);
        });
    });

    describe('countDuplicates', () => {
        it('should count extra tabs as duplicates', () => {
            const tabs = [
                createTab({ id: 1, url: 'http://a.com' }),
                createTab({ id: 2, url: 'http://a.com' }),
                createTab({ id: 3, url: 'http://a.com' }),
                createTab({ id: 4, url: 'http://b.com' })
            ];
            const map = findDuplicates(tabs);
            expect(countDuplicates(map)).toBe(2); // 3 total - 1 kept = 2 duplicates
        });
    });

    describe('getTabsToRemove', () => {
        it('should keep pinned tabs', () => {
            const tabs = [
                createTab({ id: 1, url: 'http://a.com', pinned: false }),
                createTab({ id: 2, url: 'http://a.com', pinned: true }), // Keep this
            ];
            const map = findDuplicates(tabs);
            const toRemove = getTabsToRemove(map);

            expect(toRemove).toEqual([1]); // Remove unpinned
        });

        it('should keep active tabs', () => {
            const tabs = [
                createTab({ id: 3, url: 'http://b.com', active: false }),
                createTab({ id: 4, url: 'http://b.com', active: true }), // Keep this
            ];
            const map = findDuplicates(tabs);
            const toRemove = getTabsToRemove(map);

            expect(toRemove).toEqual([3]); // Remove inactive
        });

        it('should keep pinned over active', () => {
            const tabs = [
                createTab({ id: 5, url: 'http://c.com', active: true, pinned: false }), // Active but unpinned
                createTab({ id: 6, url: 'http://c.com', active: false, pinned: true }), // Pinned (winner)
            ];
            const map = findDuplicates(tabs);
            const toRemove = getTabsToRemove(map);

            expect(toRemove).toEqual([5]); // Remove active unpinned
        });

        it('should keep oldest (lowest ID) if everything else equal', () => {
            const tabs = [
                createTab({ id: 10, url: 'http://d.com' }), // Keep
                createTab({ id: 11, url: 'http://d.com' }), // Remove
            ];
            const map = findDuplicates(tabs);
            const toRemove = getTabsToRemove(map);

            expect(toRemove).toEqual([11]);
        });
    });
});
