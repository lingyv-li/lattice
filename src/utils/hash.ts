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
 * Compute combined hash for a tab in a specific groups context.
 */
export function computeInputHash(
    tab: { url: string; title: string },
    groups: { id: number; title: string }[]
): string {
    return `${computeTabHash(tab)}+${computeGroupsHash(groups)}`;
}
