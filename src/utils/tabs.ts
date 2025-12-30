
/**
 * Applies a tab group suggestion to a set of tabs.
 * If an existingGroupId is provided, tries to add tabs to that group.
 * If that fails or no existingGroupId is provided, creates a new group.
 * 
 * @returns The groupId of the group (existing or new)
 */
export const applyTabGroup = async (
    tabIds: number[],
    groupName: string,
    existingGroupId?: number | null
): Promise<number | undefined> => {
    if (!tabIds || tabIds.length === 0) return undefined;

    // Helper to ensure at least one tabId
    const validTabIds = tabIds as [number, ...number[]];

    if (existingGroupId && existingGroupId > 0) {
        try {
            // Try to add to existing group
            await chrome.tabs.group({
                tabIds: validTabIds,
                groupId: existingGroupId
            });
            return existingGroupId;
        } catch (e: any) {
            // Check for specific error message regarding missing group
            if (e.message && e.message.includes("No group with id")) {
                // Fallback: Create new group instead
                const groupId = await chrome.tabs.group({ tabIds: validTabIds });
                await chrome.tabGroups.update(groupId, { title: groupName });
                return groupId;
            } else {
                throw e; // Rethrow other errors
            }
        }
    } else {
        // Create new group
        const groupId = await chrome.tabs.group({ tabIds: validTabIds });
        await chrome.tabGroups.update(groupId, { title: groupName });
        return groupId;
    }
};
