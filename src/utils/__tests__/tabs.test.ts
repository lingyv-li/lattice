
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTabGroup } from '../tabs';

// Mock chrome API
const mockTabs = {
    group: vi.fn(),
    get: vi.fn(),
};
const mockTabGroups = {
    update: vi.fn(),
    TAB_GROUP_ID_NONE: -1,
};

global.chrome = {
    tabs: mockTabs,
    tabGroups: mockTabGroups,
} as any;

describe('applyTabGroup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock: tabs exist and are not in a group
        mockTabs.get.mockImplementation((tabId: number) =>
            Promise.resolve({ id: tabId, groupId: -1 })
        );
    });

    it('should return undefined if no tabIds provided', async () => {
        const result = await applyTabGroup([], 'New Group');
        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });

    it('should create a new group if no existingGroupId provided', async () => {
        mockTabs.group.mockResolvedValue(123);
        mockTabGroups.update.mockResolvedValue({ id: 123, title: 'New Group' });

        const result = await applyTabGroup([1, 2], 'New Group');

        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [1, 2] });
        expect(mockTabGroups.update).toHaveBeenCalledWith(123, { title: 'New Group' });
        expect(result).toBe(123);
    });

    it('should add to existing group if existingGroupId provided', async () => {
        mockTabs.group.mockResolvedValue(456);

        const result = await applyTabGroup([3], 'Existing Group', 456);

        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 456 });
        expect(mockTabGroups.update).not.toHaveBeenCalled(); // Should not update title if just adding
        expect(result).toBe(456);
    });

    it('should fallback to creating new group if adding to existing group fails with "No group with id"', async () => {
        // First call fails
        mockTabs.group.mockRejectedValueOnce(new Error("No group with id: 999"));
        // Second call (fallback) succeeds
        mockTabs.group.mockResolvedValue(789);

        const result = await applyTabGroup([4], 'Fallback Group', 999);

        expect(mockTabs.group).toHaveBeenCalledTimes(2);
        expect(mockTabs.group).toHaveBeenNthCalledWith(1, { tabIds: [4], groupId: 999 });
        expect(mockTabs.group).toHaveBeenNthCalledWith(2, { tabIds: [4] });

        expect(mockTabGroups.update).toHaveBeenCalledWith(789, { title: 'Fallback Group' });
        expect(result).toBe(789);
    });

    it('should throw error if adding to existing group fails with other error', async () => {
        mockTabs.group.mockRejectedValue(new Error("Random error"));

        await expect(applyTabGroup([5], 'Error Group', 888)).rejects.toThrow("Random error");

        expect(mockTabs.group).toHaveBeenCalledTimes(1);
        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [5], groupId: 888 });
    });

    it('should skip tabs that no longer exist', async () => {
        // Tab 1 exists, tab 2 does not
        mockTabs.get.mockImplementation((tabId: number) => {
            if (tabId === 1) return Promise.resolve({ id: 1, groupId: -1 });
            return Promise.reject(new Error('Tab not found'));
        });
        mockTabs.group.mockResolvedValue(123);

        const result = await applyTabGroup([1, 2], 'New Group');

        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [1] });
        expect(result).toBe(123);
    });

    it('should skip tabs that are already in a group', async () => {
        // Tab 1 is not in a group, tab 2 is already in group 999
        mockTabs.get.mockImplementation((tabId: number) => {
            if (tabId === 1) return Promise.resolve({ id: 1, groupId: -1 });
            return Promise.resolve({ id: 2, groupId: 999 });
        });
        mockTabs.group.mockResolvedValue(123);

        const result = await applyTabGroup([1, 2], 'New Group');

        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [1] });
        expect(result).toBe(123);
    });

    it('should return undefined if all tabs are already grouped or missing', async () => {
        // Tab 1 is already grouped, tab 2 does not exist
        mockTabs.get.mockImplementation((tabId: number) => {
            if (tabId === 1) return Promise.resolve({ id: 1, groupId: 999 });
            return Promise.reject(new Error('Tab not found'));
        });

        const result = await applyTabGroup([1, 2], 'New Group');

        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });
});
