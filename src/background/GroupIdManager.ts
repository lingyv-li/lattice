/**
 * Manages group IDs for tab grouping, handling both virtual IDs (negative, temporary)
 * and real Chrome group IDs (positive, persistent).
 *
 * Virtual IDs are used during batch processing to maintain consistency across batches
 * before groups are actually created in Chrome.
 */
export class GroupIdManager {
    private virtualGroups = new Map<string, number>();
    private nextVirtualId = -1;

    /**
     * Resolves a group ID for a given group name.
     * Priority: existingId > cached virtual/real ID > new virtual ID
     */
    resolveGroupId(groupName: string, existingId?: number | null): number {
        // If we have an existing ID (from AI or previous batch), use it
        if (existingId) {
            return existingId;
        }

        // Check if we've already assigned an ID for this group name
        const cachedId = this.virtualGroups.get(groupName);
        if (cachedId !== undefined) {
            return cachedId;
        }

        // Assign a new virtual ID
        const virtualId = this.nextVirtualId--;
        this.virtualGroups.set(groupName, virtualId);
        return virtualId;
    }

    /**
     * Updates the mapping for a group name with a real Chrome group ID.
     * Called after successfully creating a group in Chrome.
     */
    updateWithRealId(groupName: string, realId: number): void {
        this.virtualGroups.set(groupName, realId);
    }

    /**
     * Checks if a group ID is virtual (negative) or real (positive).
     */
    isVirtual(id: number): boolean {
        return id < 0;
    }

    /**
     * Converts a group ID to a real ID for Chrome API calls.
     * Returns null for virtual IDs (which Chrome doesn't recognize).
     */
    toRealIdOrNull(id: number): number | null {
        return id > 0 ? id : null;
    }

    /**
     * Gets the current group name to ID mapping.
     * Used for AI prompt generation to maintain consistency across batches.
     */
    getGroupMap(): Map<string, number> {
        return this.virtualGroups;
    }
}
