/**
 * Keys for merging cached tab suggestions into preview groups (see useTabGrouper.convertCacheToGroups)
 * and for stable React row ids in SuggestionList — must stay in sync.
 */

/** Internal map key: one bucket per new group name or per existing Chrome tab group id. */
export function groupSuggestionKey(groupName: string, existingGroupId: number | null | undefined): string {
    return existingGroupId != null ? `existing-${existingGroupId}` : `new-${groupName}`;
}
