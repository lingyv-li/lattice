import { describe, it, expect, vi } from 'vitest';
import { WindowSnapshot } from '../snapshots';

// Mock chrome API
const mockTabs = [
    {
        id: 1,
        windowId: 1,
        url: 'https://example.com',
        title: 'Example',
        groupId: -1,
        status: 'complete'
    },
    { id: 2, windowId: 1, url: 'https://other.com', title: 'Other', groupId: 1, status: 'complete' } // Grouped tab
];

const mockGroups = [{ id: 1, windowId: 1, title: 'My Code', color: 'blue', collapsed: false }];

global.chrome = {
    tabs: {
        query: vi.fn().mockResolvedValue(mockTabs),
        TAB_ID_NONE: -1
    },
    tabGroups: {
        query: vi.fn().mockResolvedValue(mockGroups)
    }
} as unknown as typeof chrome;

describe('WindowSnapshot Integration', () => {
    it('should exclude grouped tabs from groupable tabs list', async () => {
        const snapshot = await WindowSnapshot.fetch(1);

        // Should only include the ungrouped tab (id: 1)
        expect(snapshot.tabCount).toBe(1);
        expect(snapshot.hasTab(1)).toBe(true);
        expect(snapshot.hasTab(2)).toBe(false); // Should be excluded
    });

    it('should generate correct batches ignoring grouped tabs', async () => {
        const snapshot = await WindowSnapshot.fetch(1);
        const batches = snapshot.getBatches(10);

        expect(batches.length).toBe(1);
        expect(batches[0].length).toBe(1);
        expect(batches[0][0].id).toBe(1);
    });

    describe('Deterministic Sampling', () => {
        it('should have a deterministic hash function', () => {
            const input = 'test-string';
            const hash1 = WindowSnapshot.deterministicHash(input);
            const hash2 = WindowSnapshot.deterministicHash(input);
            expect(hash1).toBe(hash2);

            // Ensure different inputs produce different hashes
            const hash3 = WindowSnapshot.deterministicHash('other-string');
            expect(hash1).not.toBe(hash3);
        });

        // Helper subclass to test protected `getPromptForBatch`
        class TestWindowSnapshot extends WindowSnapshot {
            constructor(allTabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
                super(allTabs, groups);
            }
            public testGetPromptForBatch(batch: chrome.tabs.Tab[], existingGroups: Map<string, number>) {
                return this.getPromptForBatch(batch, existingGroups);
            }
        }

        it('should deterministically sample tabs based on hash', () => {
            const groupTabs: chrome.tabs.Tab[] = [];
            for (let i = 0; i < 20; i++) {
                groupTabs.push({
                    id: 100 + i,
                    index: i,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: 1,
                    title: `Tab ${i}`,
                    url: `https://example.com/${i}`
                } as chrome.tabs.Tab);
            }

            const groups = [
                {
                    id: 1,
                    collapsed: false,
                    color: 'blue' as const,
                    title: 'Test Group',
                    windowId: 1
                } as chrome.tabGroups.TabGroup
            ];

            const snapshot = new TestWindowSnapshot(groupTabs, groups);

            // Call twice to verify stability
            const result1 = snapshot.testGetPromptForBatch([], new Map());
            const result2 = snapshot.testGetPromptForBatch([], new Map());

            // Check existingGroups Map<string, GroupContext>
            const sampled1 = result1.existingGroups.get('Test Group')?.tabs;
            const sampled2 = result2.existingGroups.get('Test Group')?.tabs;

            expect(sampled1).toBeDefined();
            expect(sampled1).toHaveLength(10);
            expect(sampled1).toEqual(sampled2);

            // Basic check that it's sorted by hash (we can't easily predict the hash order without re-hashing,
            // but we verified stability).
        });

        it('should not just select first 10 IDs (verifying non-linear sort)', () => {
            const groupTabs: chrome.tabs.Tab[] = [];
            for (let i = 0; i < 20; i++) {
                groupTabs.push({
                    id: i,
                    index: i,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: 1,
                    title: `Tab ${i}`,
                    url: `https://example.com/page/${i}`
                } as chrome.tabs.Tab);
            }

            const groups = [
                {
                    id: 1,
                    collapsed: false,
                    color: 'blue' as const,
                    title: 'Test Group',
                    windowId: 1
                } as chrome.tabGroups.TabGroup
            ];

            const snapshot = new TestWindowSnapshot(groupTabs, groups);
            const result = snapshot.testGetPromptForBatch([], new Map());
            const sampled = result.existingGroups?.get('Test Group')?.tabs;

            expect(sampled).toHaveLength(10);

            // If it picked 0..9, the sum of IDs would be 45.
            // Hash sort should likely pick a different set.
            const sumIds = sampled!.reduce((acc: number, t: { id: number }) => acc + t.id, 0);
            expect(sumIds).not.toBe(45);
        });
    });
});
