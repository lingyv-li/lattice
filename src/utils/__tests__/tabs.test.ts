
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTabGroup } from '../tabs';

// Mock chrome API
const mockTabs = {
    group: vi.fn(),
};
const mockTabGroups = {
    update: vi.fn(),
};
const mockWindows = {
    get: vi.fn(),
};

global.chrome = {
    tabs: mockTabs,
    tabGroups: mockTabGroups,
    windows: mockWindows,
} as any;

describe('applyTabGroup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: normal window with tabs 1-10
        mockWindows.get.mockResolvedValue({
            id: 1,
            type: 'normal',
            tabs: [
                { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
                { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }, { id: 10 }
            ]
        });
    });

    it('should return undefined if no tabIds provided', async () => {
        const result = await applyTabGroup([], 'New Group', null, 1);
        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });

    it('should create a new group with windowId if no existingGroupId provided', async () => {
        mockTabs.group.mockResolvedValue(123);
        mockTabGroups.update.mockResolvedValue({ id: 123, title: 'New Group' });

        const result = await applyTabGroup([1, 2], 'New Group', null, 1);

        expect(mockTabs.group).toHaveBeenCalledWith({
            tabIds: [1, 2],
            createProperties: { windowId: 1 }
        });
        expect(mockTabGroups.update).toHaveBeenCalledWith(123, { title: 'New Group' });
        expect(result).toBe(123);
    });

    it('should add to existing group if existingGroupId provided', async () => {
        mockTabs.group.mockResolvedValue(456);

        const result = await applyTabGroup([3], 'Existing Group', 456, 1);

        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [3], groupId: 456 });
        expect(mockTabGroups.update).not.toHaveBeenCalled();
        expect(result).toBe(456);
    });

    it('should fallback to creating new group if adding to existing group fails with "No group with id"', async () => {
        // First call fails
        mockTabs.group.mockRejectedValueOnce(new Error("No group with id: 999"));
        // Second call (fallback) succeeds
        mockTabs.group.mockResolvedValue(789);

        const result = await applyTabGroup([4], 'Fallback Group', 999, 1);

        expect(mockTabs.group).toHaveBeenCalledTimes(2);
        expect(mockTabs.group).toHaveBeenNthCalledWith(1, { tabIds: [4], groupId: 999 });
        expect(mockTabs.group).toHaveBeenNthCalledWith(2, {
            tabIds: [4],
            createProperties: { windowId: 1 }
        });

        expect(mockTabGroups.update).toHaveBeenCalledWith(789, { title: 'Fallback Group' });
        expect(result).toBe(789);
    });

    it('should throw error if adding to existing group fails with other error', async () => {
        mockTabs.group.mockRejectedValue(new Error("Random error"));

        await expect(applyTabGroup([5], 'Error Group', 888, 1)).rejects.toThrow("Random error");

        expect(mockTabs.group).toHaveBeenCalledTimes(1);
        expect(mockTabs.group).toHaveBeenCalledWith({ tabIds: [5], groupId: 888 });
    });

    it('should return undefined if window is not normal type', async () => {
        mockWindows.get.mockResolvedValue({ id: 1, type: 'popup', tabs: [] });

        const result = await applyTabGroup([1, 2], 'New Group', null, 1);

        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });

    it('should return undefined if window does not exist', async () => {
        mockWindows.get.mockRejectedValue(new Error('Window not found'));

        const result = await applyTabGroup([1, 2], 'New Group', null, 999);

        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });

    it('should filter out tabs not in the window', async () => {
        mockWindows.get.mockResolvedValue({
            id: 1,
            type: 'normal',
            tabs: [{ id: 1 }, { id: 2 }] // Only tabs 1 and 2 are in window
        });
        mockTabs.group.mockResolvedValue(123);

        const result = await applyTabGroup([1, 2, 99, 100], 'New Group', null, 1);

        // Should only include tabs 1 and 2
        expect(mockTabs.group).toHaveBeenCalledWith({
            tabIds: [1, 2],
            createProperties: { windowId: 1 }
        });
        expect(result).toBe(123);
    });

    it('should return undefined if no tabs are in the window', async () => {
        mockWindows.get.mockResolvedValue({
            id: 1,
            type: 'normal',
            tabs: [{ id: 99 }] // None of the requested tabs are here
        });

        const result = await applyTabGroup([1, 2], 'New Group', null, 1);

        expect(result).toBeUndefined();
        expect(mockTabs.group).not.toHaveBeenCalled();
    });
});
