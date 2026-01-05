import { describe, it, expect, vi } from 'vitest';
import { WindowSnapshot } from '../snapshots';

// Mock chrome API
const mockTabs = [
    { id: 1, windowId: 1, url: 'https://example.com', title: 'Example', groupId: -1, status: 'complete' },
    { id: 2, windowId: 1, url: 'https://other.com', title: 'Other', groupId: 1, status: 'complete' } // Grouped tab
];

const mockGroups = [
    { id: 1, windowId: 1, title: 'My Code', color: 'blue', collapsed: false }
];

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
});
