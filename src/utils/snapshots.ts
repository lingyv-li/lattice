
/**
 * Generates a stable string fingerprint of a window's state (tabs and groups).
 * Used to detect changes and skip redundant processing.
 */
export function generateWindowSnapshot(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): string {
    const tabPart = tabs
        .map(t => `${t.id}:${t.url}:${t.title}`)
        .sort()
        .join('|');
    const groupPart = groups
        .map(g => `${g.id}:${g.title}`)
        .sort()
        .join('|');

    return `${tabPart}#${groupPart}`;
}
