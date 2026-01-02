
import { TabSuggestionCache } from '../types/tabGrouper';
import { WindowSnapshot } from '../utils/snapshots';

interface StorageSchema {
    suggestionCache: TabSuggestionCache[];
    windowSnapshots: Record<number, string>;
    processingWindowIds: number[];
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
    private static processingWindows: Set<number> = new Set();
    private static isHydrated = false;

    /**
     * Hydrate state from session storage
     */
    static async hydrate(): Promise<void> {
        if (this.isHydrated) return;

        try {
            const data = await chrome.storage.session.get(['suggestionCache', 'windowSnapshots', 'processingWindowIds']) as Partial<StorageSchema>;
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

            if (data.processingWindowIds && Array.isArray(data.processingWindowIds)) {
                this.processingWindows = new Set(data.processingWindowIds);
            } else {
                this.processingWindows = new Set();
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
     * Get the list of currently processing window IDs
     */
    static async getProcessingWindows(): Promise<number[]> {
        await this.hydrate();
        return Array.from(this.processingWindows);
    }

    /**
     * Set the list of processing windows
     */
    static async setProcessingWindows(windowIds: number[]): Promise<void> {
        await this.hydrate();
        const newSet = new Set(windowIds);

        // Only persist if changed
        if (this.processingWindows.size !== newSet.size || !windowIds.every(id => this.processingWindows.has(id))) {
            this.processingWindows = newSet;
            await this.persist();
        }
    }

    /**
     * Clear all processing status (e.g. on startup)
     */
    static async clearProcessingStatus(): Promise<void> {
        await this.hydrate();
        if (this.processingWindows.size > 0) {
            this.processingWindows.clear();
            await this.persist();
        }
    }

    /**
     * Subscribe to changes for a specific window.
     * Returns a function to unsubscribe.
     * Callback receives:
     * 1. A Map<tabId, cache> for the specified window.
     * 2. A boolean indicating if the window is currently processing.
     */
    static subscribe(windowId: number, callback: (cache: Map<number, TabSuggestionCache>, isProcessing: boolean) => void): () => void {
        const handleStorageChange = (changes: StateChanges, areaName: string) => {
            if (areaName !== 'session') return;

            let shouldNotify = false;

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
                shouldNotify = true;
            }

            if (changes.windowSnapshots?.newValue) {
                const rawData = changes.windowSnapshots.newValue as Record<number, string>;
                this.snapshots = new Map(Object.entries(rawData).map(([k, v]) => [Number(k), v]));
                this.isHydrated = true;
            }

            if (changes.processingWindowIds?.newValue) {
                const rawData = changes.processingWindowIds.newValue as number[];
                const oldRawData = changes.processingWindowIds.oldValue as number[] || [];

                this.processingWindows = new Set(rawData);
                this.isHydrated = true;

                // Only notify if THIS window's status changed
                const wasProcessing = oldRawData.includes(windowId);
                const isProcessing = rawData.includes(windowId);

                console.log(`[StateService] Processing update for window ${windowId}: ${wasProcessing} -> ${isProcessing}`, { rawData, oldRawData });

                if (wasProcessing !== isProcessing) {
                    shouldNotify = true;
                }
            }

            if (shouldNotify) {
                const isProcessing = this.processingWindows.has(windowId);
                const windowCache = this.cache?.get(windowId) || new Map();
                callback(windowCache, isProcessing);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }

    /**
     * Subscribe to ANY changes in the state.
     * Useful for background processes that need to react to global changes (like badges).
     */
    static subscribeGlobal(callback: () => void): () => void {
        const handleStorageChange = (_changes: StateChanges, areaName: string) => {
            if (areaName === 'session') {
                callback();
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
            update.processingWindowIds = Array.from(this.processingWindows);
            await chrome.storage.session.set(update);
        } catch (e) {
            console.error("[StateService] Failed to persist:", e);
        }
    }
}
