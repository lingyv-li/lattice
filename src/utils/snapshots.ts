import { GroupingRequest } from '../services';
import { isGroupableTab } from './tabFilter';

/**
 * Immutable class representing a stable snapshot of a window's tab/group state.
 */
export class WindowSnapshot {
    public readonly fingerprint: string;

    protected readonly tabs: chrome.tabs.Tab[];
    protected readonly groups: chrome.tabGroups.TabGroup[];

    protected constructor(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        this.tabs = tabs.filter((t: chrome.tabs.Tab) => isGroupableTab(t));
        this.groups = groups;
        this.fingerprint = WindowSnapshot.generateFingerprint(this.tabs, this.groups);
    }

    /**
     * Fetches the current snapshot data for a window.
     * Queries for UNGROUPED tabs only (to match the persisted schema).
     * This is the single source of truth for all snapshot comparisons.
     */
    public static async fetch(windowId: number): Promise<WindowSnapshot> {
        const [tabs, groups] = await Promise.all([
            chrome.tabs.query({ windowId, groupId: chrome.tabs.TAB_ID_NONE }),
            chrome.tabGroups.query({ windowId })
        ]);

        return new WindowSnapshot(tabs, groups);
    }

    /**
     * Checks equality against another snapshot or string.
     */
    equals(other: WindowSnapshot | string | null | undefined): boolean {
        if (!other) return false;
        const otherFingerprint = typeof other === 'string' ? other : other.fingerprint;
        return this.fingerprint === otherFingerprint;
    }

    toString(): string {
        return this.fingerprint;
    }

    /**
     * Internal generation logic.
     */
    private static generateFingerprint(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]): string {
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

    /**
     * Filters the tabs in this snapshot to only include those that are suitable for grouping.
     */
    getGroupableTabs(): chrome.tabs.Tab[] {
        // cast to any because isGroupableTab likely expects a slightly different Tab type or strict type
        return this.tabs;
    }

    /**
     * Returns the number of ungrouped tabs in this snapshot.
     */
    get tabCount(): number {
        return this.tabs.length;
    }

    /**
     * Checks if a tab with the given ID exists in this snapshot.
     */
    hasTab(tabId: number): boolean {
        return this.tabs.some(t => t.id === tabId);
    }

    /**
     * Gets a tab by ID.
     * Returns undefined if the tab is not found.
     */
    getTabData(tabId: number): chrome.tabs.Tab | undefined {
        return this.tabs.find(t => t.id === tabId);
    }

    /**
     * Splits the groupable tabs into batches of the specified size.
     */
    getBatches(batchSize: number): chrome.tabs.Tab[][] {
        const validTabs = this.getGroupableTabs();
        const batches: chrome.tabs.Tab[][] = [];
        for (let i = 0; i < validTabs.length; i += batchSize) {
            batches.push(validTabs.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Prepares the input object required by the AI service for generating suggestions.
     */
    getPromptForBatch(
        batchTabs: chrome.tabs.Tab[],
        virtualGroups: Map<string, number>,
        customRules?: string
    ): GroupingRequest {
        const windowGroupNameMap = new Map<string, number>();

        // 1. Add existing groups from snapshot
        for (const group of this.groups) {
            if (group.title && group.title.trim().length > 0) {
                if (!windowGroupNameMap.has(group.title)) {
                    windowGroupNameMap.set(group.title, group.id);
                }
            }
        }

        // 2. Add virtual groups (overriding existing if same name? or skipping? implementation choice)
        // Previous logic was: if (!has) set. favoring existing groups.
        for (const [name, id] of virtualGroups) {
            if (!windowGroupNameMap.has(name)) {
                windowGroupNameMap.set(name, id);
            }
        }

        // Map chrome.tabs.Tab to the structure expected by AIService (id, title, url)
        // Adjust this if AIService expects full Tab objects or a stricter subset
        const simpleTabs = batchTabs.map(t => ({
            id: t.id!,
            title: t.title!,
            url: t.url!
        }));

        return {
            ungroupedTabs: simpleTabs,
            existingGroups: windowGroupNameMap,
            customRules: customRules
        };
    }
}
