
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

    // Filter out tabs that no longer exist or already have a group
    const validTabIds: number[] = [];
    for (const tabId of tabIds) {
        try {
            const tab = await chrome.tabs.get(tabId);
            // groupId of -1 means not in a group, skip tabs already in a group
            if (tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
                validTabIds.push(tabId);
            }
        } catch {
            // Tab no longer exists, skip it
        }
    }

    if (validTabIds.length === 0) return undefined;

    // After the length check, we know validTabIds is non-empty
    const tabIdsToGroup = validTabIds as [number, ...number[]];

    if (existingGroupId && existingGroupId > 0) {
        try {
            // Try to add to existing group
            await chrome.tabs.group({
                tabIds: tabIdsToGroup,
                groupId: existingGroupId
            });
            return existingGroupId;
        } catch (e: any) {
            // Check for specific error message regarding missing group
            if (e.message && e.message.includes("No group with id")) {
                // Fallback: Create new group instead
                const groupId = await chrome.tabs.group({ tabIds: tabIdsToGroup });
                await chrome.tabGroups.update(groupId, { title: groupName });
                return groupId;
            } else {
                throw e; // Rethrow other errors
            }
        }
    } else {
        // Create new group
        const groupId = await chrome.tabs.group({ tabIds: tabIdsToGroup });
        await chrome.tabGroups.update(groupId, { title: groupName });
        return groupId;
    }
};
