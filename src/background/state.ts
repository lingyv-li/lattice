
import { TabSuggestionCache } from '../types/tabGrouper';

interface StorageSchema {
    suggestionCache: TabSuggestionCache[];
    windowSnapshots: Record<number, string>;
}

type StateChanges = {
    [K in keyof StorageSchema]?: chrome.storage.StorageChange;
};

export class StateService {
    // In-memory cache for speed
    private static cache: Map<number, TabSuggestionCache> | null = null;
    private static snapshots: Map<number, string> = new Map();
    private static isHydrated = false;

    /**
     * Hydrate state from session storage
     */
    static async hydrate(): Promise<void> {
        if (this.isHydrated) return;

        try {
            const data = await chrome.storage.session.get(['suggestionCache', 'windowSnapshots']) as Partial<StorageSchema>;
            if (data.suggestionCache && Array.isArray(data.suggestionCache)) {
                this.cache = new Map(data.suggestionCache.map(s => [s.tabId, s]));
            } else {
                this.cache = new Map();
            }

            if (data.windowSnapshots) {
                this.snapshots = new Map(Object.entries(data.windowSnapshots).map(([k, v]) => [Number(k), v]));
            } else {
                this.snapshots = new Map();
            }
            this.isHydrated = true;
        } catch (e) {
            console.error("[StateService] Failed to hydrate:", e);
            // Fallback to empty map if storage fails
            this.cache = new Map();
        }
    }

    /**
     * Get the full suggestion cache
     */
    static async getSuggestionCache(): Promise<Map<number, TabSuggestionCache>> {
        await this.hydrate();
        return this.cache || new Map();
    }

    /**
     * Get a specific suggestion
     */
    static async getSuggestion(tabId: number): Promise<TabSuggestionCache | undefined> {
        await this.hydrate();
        return this.cache?.get(tabId);
    }

    /**
     * Set the entire cache map (and persist)
     */
    static async setSuggestionCache(newCache: Map<number, TabSuggestionCache>): Promise<void> {
        this.cache = newCache;
        this.isHydrated = true;
        await this.persist();
    }

    /**
     * Update or add a single suggestion
     */
    static async updateSuggestion(suggestion: TabSuggestionCache): Promise<void> {
        await this.hydrate();
        if (!this.cache) this.cache = new Map();

        this.cache.set(suggestion.tabId, suggestion);
        await this.persist();
    }

    /**
     * Update multiple suggestions in batch
     */
    static async updateSuggestions(suggestions: TabSuggestionCache[]): Promise<void> {
        await this.hydrate();
        if (!this.cache) this.cache = new Map();

        for (const suggestion of suggestions) {
            this.cache.set(suggestion.tabId, suggestion);
        }
        await this.persist();
    }

    /**
     * Remove a suggestion by tab ID
     */
    static async removeSuggestion(tabId: number): Promise<boolean> {
        await this.hydrate();
        if (!this.cache) return false;

        const deleted = this.cache.delete(tabId);
        if (deleted) {
            await this.persist();
        }
        return deleted;
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
    static async updateWindowSnapshot(windowId: number, snapshot: string): Promise<void> {
        await this.hydrate();
        this.snapshots.set(windowId, snapshot);
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
     */
    static subscribe(callback: (cache: Map<number, TabSuggestionCache>) => void): () => void {
        const handleStorageChange = (changes: StateChanges, areaName: string) => {
            if (areaName === 'session') {
                if (changes.suggestionCache?.newValue) {
                    const rawData = changes.suggestionCache.newValue as TabSuggestionCache[];
                    this.cache = new Map(rawData.map(s => [s.tabId, s]));
                    this.isHydrated = true;
                    callback(this.cache);
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
                update.suggestionCache = Array.from(this.cache.values());
            }
            update.windowSnapshots = Object.fromEntries(this.snapshots.entries());
            await chrome.storage.session.set(update);
        } catch (e) {
            console.error("[StateService] Failed to persist:", e);
        }
    }
}
