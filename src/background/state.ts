
import { TabSuggestionCache } from '../types/tabGrouper';

interface StorageSchema {
    suggestionCache: TabSuggestionCache[];
}

export class StateService {
    // In-memory cache for speed
    private static cache: Map<number, TabSuggestionCache> | null = null;
    private static isHydrated = false;

    /**
     * Hydrate state from session storage
     */
    static async hydrate(): Promise<void> {
        if (this.isHydrated) return;

        try {
            const data = await chrome.storage.session.get('suggestionCache') as Partial<StorageSchema>;
            if (data.suggestionCache && Array.isArray(data.suggestionCache)) {
                this.cache = new Map(data.suggestionCache.map(s => [s.tabId, s]));
            } else {
                this.cache = new Map();
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

    private static listeners: Set<() => void> = new Set();

    /**
     * Subscribe to changes
     */
    static subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private static notifyListeners() {
        for (const listener of this.listeners) {
            listener();
        }
    }

    /**
     * Persist current in-memory cache to session storage
     */
    private static async persist(): Promise<void> {
        if (!this.cache) return;
        try {
            const serialized = Array.from(this.cache.values());
            await chrome.storage.session.set({ suggestionCache: serialized });
            this.notifyListeners();
        } catch (e) {
            console.error("[StateService] Failed to persist:", e);
        }
    }
}
