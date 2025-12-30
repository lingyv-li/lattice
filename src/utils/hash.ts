/**
 * Utilities for computing input hashes for staleness detection.
 */

/**
 * Compute hash for a single tab's identity (URL + title).
 */
export function computeTabHash(tab: { url: string; title: string }): string {
    return `${tab.url}-${tab.title}`;
}

/**
 * Compute hash for existing groups in a window.
 * All tabs in a batch share the same groups context.
 */
export function computeGroupsHash(groups: { id: number; title: string }[]): string {
    return groups
        .map(g => g.title)
        .sort()
        .join('|');
}

/**
 * Compute hash for an entire batch of tabs + groups.
 * Used for batch staleness detection - if ANY input changed, whole batch is stale.
 */
export function computeBatchHash(
    tabs: { url: string; title: string }[],
    groups: { id: number; title: string }[]
): string {
    const tabsHash = tabs
        .map(t => computeTabHash(t))
        .sort()
        .join('|');
    return `${tabsHash}+${computeGroupsHash(groups)}`;
}
