import { GroupingRequest } from '../services';
import { isGroupableTab } from './tabFilter';

/**
 * Immutable class representing a stable snapshot of a window's tab/group state.
 */
export class WindowSnapshot {
    public readonly fingerprint: string;

    private readonly allTabs: chrome.tabs.Tab[];
    protected readonly tabs: chrome.tabs.Tab[];
    protected readonly groups: chrome.tabGroups.TabGroup[];

    // O(1) Lookup structures
    private readonly allTabsMap: Map<number, chrome.tabs.Tab>;
    private readonly ungroupedTabIds: Set<number>;

    protected constructor(allTabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[]) {
        this.allTabs = allTabs;
        // Keep "tabs" as only the ungrouped tabs to preserve existing behavior
        this.tabs = allTabs.filter((t: chrome.tabs.Tab) => isGroupableTab(t));
        this.groups = groups;
        this.fingerprint = WindowSnapshot.generateFingerprint(this.tabs, this.groups);

        // Initialize lookup structures for O(1) access
        this.allTabsMap = new Map();
        for (const tab of this.allTabs) {
            if (tab.id !== undefined) {
                this.allTabsMap.set(tab.id, tab);
            }
        }

        this.ungroupedTabIds = new Set();
        for (const tab of this.tabs) {
            if (tab.id !== undefined) {
                this.ungroupedTabIds.add(tab.id);
            }
        }
    }

    /**
     * Fetches the current snapshot data for a window.
     * Queries for ALL tabs to support smart staleness checks.
     */
    public static async fetch(windowId: number): Promise<WindowSnapshot> {
        const [tabs, groups] = await Promise.all([
            chrome.tabs.query({ windowId }),
            chrome.tabGroups.query({ windowId })
        ]);

        return new WindowSnapshot(tabs, groups);
    }

    /**
     * Efficiently fetches snapshots for ALL windows matching the given filter.
     * Reduces Chrome IPC overhead by querying all tabs/groups once and partitioning in memory.
     */
    public static async fetchAll(filter?: chrome.windows.QueryOptions): Promise<Map<number, WindowSnapshot>> {
        // 1. Get relevant windows
        const windows = await chrome.windows.getAll(filter ?? {});
        const validWindowIds = new Set(windows.map(w => w.id!).filter(id => id !== undefined));

        if (validWindowIds.size === 0) {
            return new Map();
        }

        // 2. Get all tabs and groups (O(1) IPC call)
        const [allTabs, allGroups] = await Promise.all([
            chrome.tabs.query({}),
            chrome.tabGroups.query({})
        ]);

        // 3. Partition data by windowId (only for valid windows)
        const tabsByWindow = new Map<number, chrome.tabs.Tab[]>();
        const groupsByWindow = new Map<number, chrome.tabGroups.TabGroup[]>();

        for (const tab of allTabs) {
            if (tab.windowId !== undefined && validWindowIds.has(tab.windowId)) {
                if (!tabsByWindow.has(tab.windowId)) tabsByWindow.set(tab.windowId, []);
                tabsByWindow.get(tab.windowId)!.push(tab);
            }
        }

        for (const group of allGroups) {
            if (group.windowId !== undefined && validWindowIds.has(group.windowId)) {
                if (!groupsByWindow.has(group.windowId)) groupsByWindow.set(group.windowId, []);
                groupsByWindow.get(group.windowId)!.push(group);
            }
        }

        const snapshots = new Map<number, WindowSnapshot>();
        for (const windowId of validWindowIds) {
            snapshots.set(windowId, new WindowSnapshot(
                tabsByWindow.get(windowId) || [],
                groupsByWindow.get(windowId) || []
            ));
        }

        return snapshots;
    }

    /**
     * Checks equality against another snapshot or string.
     */
    equals(other: WindowSnapshot | string | null | undefined): boolean {
        if (!other) return false;
        const otherFingerprint = typeof other === 'string' ? other : other.fingerprint;
        return this.fingerprint === otherFingerprint;
    }

    /**
     * Determines if a change in the new snapshot is "Fatal" for the given relevant tabs.
     * Fatal changes = Group structure changed OR relevant tabs were manually grouped.
     * Benign changes = New tabs opened, irrelevant tabs moved, or relevant tabs closed.
     */
    isFatalChange(newSnapshot: WindowSnapshot, relevantTabIds: number[]): boolean {
        // 1. Group Structure Change (Strict equality)
        // If groups were renamed, removed, or added -> Fatal (Context changed)
        const currentGroupFingerprint = this.groups.map(g => `${g.id}:${g.title}`).sort().join('|');
        const newGroupFingerprint = newSnapshot.groups.map(g => `${g.id}:${g.title}`).sort().join('|');

        if (currentGroupFingerprint !== newGroupFingerprint) {
            console.log(`[WindowSnapshot] Fatal: Group structure changed.`);
            return true;
        }

        // 2. User Intervention Check
        // Check if any of the "relevant tabs" (tabs we are about to group) have been moved
        // to a group in the new snapshot.
        for (const tabId of relevantTabIds) {
            const newTab = newSnapshot.getTabData(tabId);

            // If tab is missing, it was closed. This is NOT fatal (we just skip it later).
            if (!newTab) continue;

            // If tab exists but is now grouped (and wasn't before, implied by being in relevantTabIds),
            // then the user manually grouped it. This IS Fatal.
            if (newTab.groupId !== chrome.tabs.TAB_ID_NONE) {
                console.log(`[WindowSnapshot] Fatal: Tab ${tabId} was manually grouped (gid: ${newTab.groupId}).`);
                return true;
            }
        }

        return false;
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
     * Returns all tabs in this snapshot (including pinned/grouped).
     */
    get all(): chrome.tabs.Tab[] {
        return this.allTabs;
    }

    /**
     * Checks if a tab with the given ID exists in this snapshot (Ungrouped only).
     */
    hasTab(tabId: number): boolean {
        return this.ungroupedTabIds.has(tabId);
    }

    /**
     * Gets a tab by ID.
     * Returns undefined if the tab is not found.
     */
    getTabData(tabId: number): chrome.tabs.Tab | undefined {
        return this.allTabsMap.get(tabId);
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
    ): Omit<GroupingRequest, 'signal'> {
        const existingGroupsContext = new Map<string, { id: number; tabs: { id: number; title: string; url: string; }[] }>();
        const groupIdToName = new Map<number, string>();

        // 1. Add existing groups from snapshot
        for (const group of this.groups) {
            if (group.title && group.title.trim().length > 0) {
                if (!existingGroupsContext.has(group.title)) {
                    existingGroupsContext.set(group.title, { id: group.id, tabs: [] });
                    groupIdToName.set(group.id, group.title);
                }
            }
        }

        // 2. Add virtual groups
        for (const [name, id] of virtualGroups) {
            if (!existingGroupsContext.has(name)) {
                existingGroupsContext.set(name, { id, tabs: [] });
                groupIdToName.set(id, name);
            }
        }

        // Map chrome.tabs.Tab to the structure expected by AIService (id, title, url)
        // Adjust this if AIService expects full Tab objects or a stricter subset
        const simpleTabs = batchTabs.map(t => ({
            id: t.id!,
            title: t.title!,
            url: t.url!
        }));

        // 3. Populate existingGroups tabs with deterministic sampling
        // Group tabs by their group name
        const tabsByGroupName = new Map<string, chrome.tabs.Tab[]>();
        for (const tab of this.allTabs) {
            if (tab.groupId !== chrome.tabs.TAB_ID_NONE && tab.groupId !== undefined) {
                const groupName = groupIdToName.get(tab.groupId);
                if (groupName) {
                    if (!tabsByGroupName.has(groupName)) {
                        tabsByGroupName.set(groupName, []);
                    }
                    tabsByGroupName.get(groupName)!.push(tab);
                }
            }
        }

        // Sample up to 10 tabs per group deterministically using a hash
        // This ensures a "random" distribution that is stable across calls
        for (const [groupName, tabs] of tabsByGroupName) {
            const sortedTabs = tabs.sort((a, b) => {
                const hashA = WindowSnapshot.deterministicHash(`${a.id}:${a.url}`);
                const hashB = WindowSnapshot.deterministicHash(`${b.id}:${b.url}`);
                return hashA - hashB;
            });

            const sampledTabs = sortedTabs.slice(0, 10).map(t => ({
                id: t.id!,
                title: t.title!,
                url: t.url!
            }));

            if (existingGroupsContext.has(groupName)) {
                existingGroupsContext.get(groupName)!.tabs = sampledTabs;
            }
        }

        return {
            ungroupedTabs: simpleTabs,
            existingGroups: existingGroupsContext,
            customRules: customRules
        };
    }

    /**
     * Simple deterministic hash function (djb2 implementation)
     * Used for consistent random sampling of tabs.
     */
    public static deterministicHash(str: string): number {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
        }
        return hash >>> 0;
    }
}
