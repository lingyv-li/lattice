
import { TabSuggestionCache } from '../types/tabGrouper';
import { WindowSnapshot } from '../utils/snapshots';

interface StorageSchema {
    suggestionCache: TabSuggestionCache[];
    windowSnapshots: Record<number, string>;
}

type StateChanges = {
    [K in keyof StorageSchema]?: chrome.storage.StorageChange;
};

// Nested cache: windowId -> tabId -> cache
type WindowCache = Map<number, Map<number, TabSuggestionCache>>;

export class StateService {
    // In-memory cache: windowId -> (tabId -> suggestion)
    private static cache: WindowCache | null = null;
    private static snapshots: Map<number, string> = new Map();
    private static isHydrated = false;

    /**
     * Hydrate state from session storage
     */
    static async hydrate(): Promise<void> {
        if (this.isHydrated) return;

        try {
            const data = await chrome.storage.session.get(['suggestionCache', 'windowSnapshots']) as Partial<StorageSchema>;
            this.cache = new Map();

            if (data.suggestionCache && Array.isArray(data.suggestionCache)) {
                for (const s of data.suggestionCache) {
                    if (!this.cache.has(s.windowId)) {
                        this.cache.set(s.windowId, new Map());
                    }
                    this.cache.get(s.windowId)!.set(s.tabId, s);
                }
            }

            if (data.windowSnapshots) {
                this.snapshots = new Map(Object.entries(data.windowSnapshots).map(([k, v]) => [Number(k), v]));
            } else {
                this.snapshots = new Map();
            }
            this.isHydrated = true;
        } catch (e) {
            console.error("[StateService] Failed to hydrate:", e);
            this.cache = new Map();
        }
    }

    /**
     * Get the suggestion cache for a specific window.
     */
    static async getSuggestionCache(windowId: number): Promise<Map<number, TabSuggestionCache>> {
        await this.hydrate();
        return this.cache?.get(windowId) || new Map();
    }

    /**
     * Get all window IDs that have cached suggestions.
     */
    static async getCachedWindowIds(): Promise<number[]> {
        await this.hydrate();
        return Array.from(this.cache?.keys() || []);
    }

    /**
     * Get a specific suggestion
     */
    static async getSuggestion(tabId: number, windowId?: number): Promise<TabSuggestionCache | undefined> {
        await this.hydrate();
        if (!this.cache) return undefined;

        if (windowId !== undefined) {
            return this.cache.get(windowId)?.get(tabId);
        }

        // Search all windows
        for (const windowMap of this.cache.values()) {
            const s = windowMap.get(tabId);
            if (s) return s;
        }
        return undefined;
    }

    /**
     * Update or add suggestions (must include windowId in each suggestion)
     */
    static async updateSuggestions(suggestions: TabSuggestionCache[]): Promise<void> {
        await this.hydrate();
        if (!this.cache) this.cache = new Map();

        for (const suggestion of suggestions) {
            if (!this.cache.has(suggestion.windowId)) {
                this.cache.set(suggestion.windowId, new Map());
            }
            this.cache.get(suggestion.windowId)!.set(suggestion.tabId, suggestion);
        }
        await this.persist();
    }

    /**
     * Remove a suggestion by tab ID (searches all windows)
     */
    static async removeSuggestion(tabId: number): Promise<boolean> {
        await this.hydrate();
        if (!this.cache) return false;

        let deleted = false;
        for (const windowMap of this.cache.values()) {
            if (windowMap.delete(tabId)) {
                deleted = true;
                break;
            }
        }
        if (deleted) {
            await this.persist();
        }
        return deleted;
    }

    /**
     * Clear all suggestions for a window
     */
    static async clearWindowCache(windowId: number): Promise<void> {
        await this.hydrate();
        if (this.cache?.delete(windowId)) {
            await this.persist();
        }
    }

    /**
     * Clear all suggestions
     */
    static async clearCache(): Promise<void> {
        this.cache = new Map();
        this.isHydrated = true;
        await this.persist();
    }

    /**
     * Get the last processed snapshot for a window
     */
    static async getWindowSnapshot(windowId: number): Promise<string | undefined> {
        await this.hydrate();
        return this.snapshots.get(windowId);
    }

    /**
     * Update the snapshot for a window
     */
    static async updateWindowSnapshot(windowId: number, snapshot: WindowSnapshot): Promise<void> {
        await this.hydrate();
        this.snapshots.set(windowId, snapshot.fingerprint);
        await this.persist();
    }

    /**
     * Clear snapshot for a window
     */
    static async clearWindowSnapshot(windowId: number): Promise<void> {
        await this.hydrate();
        if (this.snapshots.delete(windowId)) {
            await this.persist();
        }
    }

    /**
     * Subscribe to changes in the suggestion cache.
     * Returns a function to unsubscribe.
     * Callback receives a flattened Map<tabId, cache> for the specified window (or all if not specified).
     */
    static subscribe(callback: (cache: Map<number, TabSuggestionCache>, windowId?: number) => void, windowId?: number): () => void {
        const handleStorageChange = (changes: StateChanges, areaName: string) => {
            if (areaName === 'session') {
                if (changes.suggestionCache?.newValue) {
                    const rawData = changes.suggestionCache.newValue as TabSuggestionCache[];
                    this.cache = new Map();
                    for (const s of rawData) {
                        if (!this.cache.has(s.windowId)) {
                            this.cache.set(s.windowId, new Map());
                        }
                        this.cache.get(s.windowId)!.set(s.tabId, s);
                    }
                    this.isHydrated = true;

                    // Call callback with the relevant window's cache
                    if (windowId !== undefined) {
                        callback(this.cache.get(windowId) || new Map(), windowId);
                    } else {
                        // Flatten all
                        const flat = new Map<number, TabSuggestionCache>();
                        for (const windowMap of this.cache.values()) {
                            for (const [tabId, s] of windowMap) {
                                flat.set(tabId, s);
                            }
                        }
                        callback(flat);
                    }
                }
                if (changes.windowSnapshots?.newValue) {
                    const rawData = changes.windowSnapshots.newValue as Record<number, string>;
                    this.snapshots = new Map(Object.entries(rawData).map(([k, v]) => [Number(k), v]));
                    this.isHydrated = true;
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }

    /**
     * Persist current in-memory cache to session storage
     */
    private static async persist(): Promise<void> {
        try {
            const update: Partial<StorageSchema> = {};
            if (this.cache) {
                // Flatten to array for storage
                const flat: TabSuggestionCache[] = [];
                for (const windowMap of this.cache.values()) {
                    for (const s of windowMap.values()) {
                        flat.push(s);
                    }
                }
                update.suggestionCache = flat;
            }
            update.windowSnapshots = Object.fromEntries(this.snapshots.entries());
            await chrome.storage.session.set(update);
        } catch (e) {
            console.error("[StateService] Failed to persist:", e);
        }
    }
}
