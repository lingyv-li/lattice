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

    describe('openerTabId mapping', () => {
        class TestWindowSnapshot extends WindowSnapshot {
            constructor(allTabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
                super(allTabs, groups);
            }
            public testGetPromptForBatch(batch: chrome.tabs.Tab[], existingGroups: Map<string, number>) {
                return this.getPromptForBatch(batch, existingGroups);
            }
        }

        it('should include openerTabId in TabData when the chrome tab has one', () => {
            const batchTabs: chrome.tabs.Tab[] = [
                {
                    id: 10,
                    index: 0,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'GitHub',
                    url: 'https://github.com',
                    status: 'complete'
                } as chrome.tabs.Tab,
                {
                    id: 11,
                    index: 1,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'PR #42',
                    url: 'https://github.com/org/repo/pull/42',
                    openerTabId: 10,
                    status: 'complete'
                } as chrome.tabs.Tab
            ];

            const snapshot = new TestWindowSnapshot(batchTabs, []);
            const result = snapshot.testGetPromptForBatch(batchTabs, new Map());

            const tabs = result.ungroupedTabs;
            expect(tabs).toHaveLength(2);

            const parent = tabs.find(t => t.id === 10);
            const child = tabs.find(t => t.id === 11);

            expect(parent?.openerTabId).toBeUndefined();
            expect(child?.openerTabId).toBe(10);
        });

        it('should omit openerTabId in TabData when the chrome tab has none', () => {
            const batchTabs: chrome.tabs.Tab[] = [
                {
                    id: 1,
                    index: 0,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'Tab without opener',
                    url: 'https://example.com',
                    status: 'complete'
                } as chrome.tabs.Tab
            ];

            const snapshot = new TestWindowSnapshot(batchTabs, []);
            const result = snapshot.testGetPromptForBatch(batchTabs, new Map());

            expect(result.ungroupedTabs[0].openerTabId).toBeUndefined();
            expect('openerTabId' in result.ungroupedTabs[0]).toBe(false);
        });

        it('should preserve openerTabId for multiple child tabs sharing the same opener', () => {
            const batchTabs: chrome.tabs.Tab[] = [
                {
                    id: 20,
                    index: 0,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'Parent',
                    url: 'https://parent.com',
                    status: 'complete'
                } as chrome.tabs.Tab,
                {
                    id: 21,
                    index: 1,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'Child A',
                    url: 'https://child-a.com',
                    openerTabId: 20,
                    status: 'complete'
                } as chrome.tabs.Tab,
                {
                    id: 22,
                    index: 2,
                    windowId: 1,
                    highlighted: false,
                    active: false,
                    pinned: false,
                    incognito: false,
                    selected: false,
                    discarded: false,
                    autoDiscardable: true,
                    groupId: -1,
                    title: 'Child B',
                    url: 'https://child-b.com',
                    openerTabId: 20,
                    status: 'complete'
                } as chrome.tabs.Tab
            ];

            const snapshot = new TestWindowSnapshot(batchTabs, []);
            const result = snapshot.testGetPromptForBatch(batchTabs, new Map());

            const childA = result.ungroupedTabs.find(t => t.id === 21);
            const childB = result.ungroupedTabs.find(t => t.id === 22);

            expect(childA?.openerTabId).toBe(20);
            expect(childB?.openerTabId).toBe(20);
        });
    });
});
