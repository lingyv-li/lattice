/** Extracts defined tab IDs from an array of tabs. */
export const getTabIds = (tabs: chrome.tabs.Tab[]): number[] =>
    tabs.map(t => t.id).filter((id): id is number => id !== undefined);

/**
 * Applies a tab group suggestion to a set of tabs.
 * If an existingGroupId is provided, tries to add tabs to that group.
 * If that fails or no existingGroupId is provided, creates a new group.
 *
 * @param windowId - The window ID to create the group in.
 * @returns The groupId of the group (existing or new)
 */
export const applyTabGroup = async (tabIds: number[], groupName: string, existingGroupId: number | null | undefined, windowId: number): Promise<number | undefined> => {
    if (!tabIds || tabIds.length === 0) return undefined;

    // Validate window type and get tabs in single API call
    let windowTabIds: Set<number>;
    try {
        const window = await chrome.windows.get(windowId, { populate: true });
        if (window.type !== 'normal') {
            return undefined; // Can't group tabs in non-normal windows
        }
        windowTabIds = new Set(getTabIds(window.tabs ?? []));
    } catch {
        return undefined; // Window doesn't exist
    }

    // Filter to only tabs that are still in this window
    const validTabIds = tabIds.filter(id => windowTabIds.has(id));
    if (validTabIds.length === 0) return undefined;

    // After the length check, we know validTabIds is non-empty
    const tabIdsToGroup = validTabIds as [number, ...number[]];

    const createNewGroup = async (): Promise<number> => {
        const groupId = await chrome.tabs.group({
            tabIds: tabIdsToGroup,
            createProperties: { windowId }
        });
        await chrome.tabGroups.update(groupId, { title: groupName });
        return groupId;
    };

    if (existingGroupId && existingGroupId > 0) {
        try {
            // Try to add to existing group
            await chrome.tabs.group({
                tabIds: tabIdsToGroup,
                groupId: existingGroupId
            });
            return existingGroupId;
        } catch (e: unknown) {
            // Check for specific error message regarding missing group
            const message = e instanceof Error ? e.message : String(e);
            if (message.includes('No group with id')) {
                return createNewGroup();
            } else {
                throw e; // Rethrow other errors
            }
        }
    } else {
        return createNewGroup();
    }
};
