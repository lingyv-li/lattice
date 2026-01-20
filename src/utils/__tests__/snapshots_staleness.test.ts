import { describe, it, expect, vi } from 'vitest';
import { WindowSnapshot } from '../snapshots';
import { GroupingRequest } from '../../services/ai/types';

// Mock chrome API
const mockTabs: chrome.tabs.Tab[] = [];
const mockGroups: chrome.tabGroups.TabGroup[] = [];

global.chrome = {
    tabs: {
        query: vi.fn().mockResolvedValue(mockTabs),
        TAB_ID_NONE: -1
    },
    tabGroups: {
        query: vi.fn().mockResolvedValue(mockGroups)
    }
} as unknown as typeof chrome;

// Helper subclass to access protected methods
class TestWindowSnapshot extends WindowSnapshot {
    constructor(allTabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        super(allTabs, groups);
    }
    public testGetPromptForBatch(batch: chrome.tabs.Tab[], existingGroups: Map<string, number>): Omit<GroupingRequest, 'signal'> {
        return this.getPromptForBatch(batch, existingGroups);
    }
}

describe('WindowSnapshot Staleness Logic', () => {
    it('should calculate lastActive for existing groups based on max(tab.lastAccessed)', () => {
        const now = Date.now();
        const hourAgo = now - 3600 * 1000;
        const dayAgo = now - 24 * 3600 * 1000;

        const group1Id = 101;
        const group2Id = 102;

        const tabs = [
            // Group 1 tabs: one recent, one old
            { id: 1, groupId: group1Id, lastAccessed: hourAgo, title: 'G1 Tab 1', url: 'http://a.com', windowId: 1 },
            { id: 2, groupId: group1Id, lastAccessed: now, title: 'G1 Tab 2', url: 'http://b.com', windowId: 1 },
            // Group 2 tabs: all old
            { id: 3, groupId: group2Id, lastAccessed: dayAgo, title: 'G2 Tab 1', url: 'http://c.com', windowId: 1 },
        ] as chrome.tabs.Tab[];

        const groups = [
            { id: group1Id, title: 'Active Group', windowId: 1, color: 'blue', collapsed: false },
            { id: group2Id, title: 'Stale Group', windowId: 1, color: 'red', collapsed: false }
        ] as chrome.tabGroups.TabGroup[];

        const snapshot = new TestWindowSnapshot(tabs, groups);
        const result = snapshot.testGetPromptForBatch([], new Map());

        const g1Context = result.existingGroups.get('Active Group');
        const g2Context = result.existingGroups.get('Stale Group');

        expect(g1Context).toBeDefined();
        expect(g1Context?.lastActive).toBe(now); // Should pick the max

        expect(g2Context).toBeDefined();
        expect(g2Context?.lastActive).toBe(dayAgo);
    });

    it('should assign current time as lastActive for virtual groups', () => {
        const tabs: chrome.tabs.Tab[] = [];
        const groups: chrome.tabGroups.TabGroup[] = [];

        const snapshot = new TestWindowSnapshot(tabs, groups);

        const virtualGroups = new Map<string, number>();
        virtualGroups.set('Virtual Group', -1);

        const result = snapshot.testGetPromptForBatch([], virtualGroups);
        const vContext = result.existingGroups.get('Virtual Group');

        expect(vContext).toBeDefined();
        // Should be close to Date.now()
        expect(vContext?.lastActive).toBeGreaterThan(Date.now() - 1000);
        expect(vContext?.lastActive).toBeLessThanOrEqual(Date.now());
    });
});
