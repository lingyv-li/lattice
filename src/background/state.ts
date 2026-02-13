import { TabSuggestionCache } from '../types/tabGrouper';
import { Action, ACTION_HISTORY_MAX } from '../types/suggestions';
import { WindowSnapshot } from '../utils/snapshots';

/** Converts a string-keyed record to a number-keyed Map. Handles undefined/null. */
const toNumberKeyedMap = <V>(record: Record<string, V> | undefined | null): Map<number, V> => (record ? new Map(Object.entries(record).map(([k, v]) => [Number(k), v])) : new Map());

/** Builds the window->tab cache structure from a flat suggestion array. */
const buildWindowCache = (suggestions: TabSuggestionCache[]): WindowCache => {
    const cache = new Map<number, Map<number, TabSuggestionCache>>();
    for (const s of suggestions) {
        if (!cache.has(s.windowId)) cache.set(s.windowId, new Map());
        cache.get(s.windowId)!.set(s.tabId, s);
    }
    return cache;
};

interface StorageSchema {
    suggestionCache: TabSuggestionCache[];
    windowSnapshots: Record<number, string>;
    processingWindowIds: number[];
    duplicateCounts: Record<number, number>;
    actionHistory: Action[];
}

type ActionHistoryListener = (history: Action[]) => void;

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
    private static duplicateCounts: Map<number, number> = new Map();
    private static actionHistory: Action[] = [];
    private static actionHistoryListeners: Set<ActionHistoryListener> = new Set();
    private static isHydrated = false;

    private static notifyActionHistoryListeners(): void {
        const h = this.actionHistory;
        this.actionHistoryListeners.forEach(cb => cb(h));
    }

    /**
     * Hydrate state from session storage
     */
    static async hydrate(): Promise<void> {
        if (this.isHydrated) return;

        try {
            const data = (await chrome.storage.session.get(['suggestionCache', 'windowSnapshots', 'processingWindowIds', 'duplicateCounts', 'actionHistory'])) as Partial<StorageSchema>;
            this.cache =
                data.suggestionCache && Array.isArray(data.suggestionCache) ? buildWindowCache(data.suggestionCache) : new Map();

            this.snapshots = toNumberKeyedMap(data.windowSnapshots);

            if (data.processingWindowIds && Array.isArray(data.processingWindowIds)) {
                this.processingWindows = new Set(data.processingWindowIds);
            } else {
                this.processingWindows = new Set();
            }

            this.duplicateCounts = toNumberKeyedMap(data.duplicateCounts);

            this.actionHistory = Array.isArray(data.actionHistory) ? data.actionHistory : [];

            this.isHydrated = true;
        } catch (e) {
            console.error('[StateService] Failed to hydrate:', e);
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
     * Remove suggestions for tabs that are not in the valid list for a window
     */
    static async pruneSuggestions(windowId: number, validTabIds: Set<number>): Promise<void> {
        await this.hydrate();
        const windowCache = this.cache?.get(windowId);
        if (!windowCache) return;

        let changed = false;
        for (const tabId of windowCache.keys()) {
            if (!validTabIds.has(tabId)) {
                windowCache.delete(tabId);
                changed = true;
            }
        }

        if (changed) {
            await this.persist();
        }
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
     * Get duplicate count for a window
     */
    static async getDuplicateCount(windowId: number): Promise<number> {
        await this.hydrate();
        return this.duplicateCounts.get(windowId) || 0;
    }

    /**
     * Update duplicate count for a window
     */
    static async updateDuplicateCount(windowId: number, count: number): Promise<void> {
        await this.hydrate();
        if (this.duplicateCounts.get(windowId) !== count) {
            this.duplicateCounts.set(windowId, count);
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
     * Push an action onto history (keeps last N). Used after user accepts a suggestion.
     * Notifies subscribers immediately so the UI updates without waiting for storage events.
     */
    static async pushAction(action: Action): Promise<void> {
        await this.hydrate();
        this.actionHistory = [...this.actionHistory, action].slice(-ACTION_HISTORY_MAX);
        this.notifyActionHistoryListeners();
        await this.persist();
    }

    /**
     * Record a group action (manual or autopilot). Unified entry so both paths are undoable.
     */
    static async pushGroupAction(params: { windowId: number; tabIds: number[]; groupName: string; existingGroupId?: number | null }): Promise<void> {
        await this.pushAction({
            type: 'group',
            windowId: params.windowId,
            tabIds: params.tabIds,
            groupName: params.groupName,
            existingGroupId: params.existingGroupId
        });
    }

    /**
     * Record a deduplicate action (manual or autopilot). Unified entry so both paths are undoable.
     */
    static async pushDeduplicateAction(params: { windowId: number; url: string; urls: string[] }): Promise<void> {
        await this.pushAction({
            type: 'deduplicate',
            windowId: params.windowId,
            url: params.url,
            urls: params.urls
        });
    }

    /**
     * Get action history, optionally filtered by window.
     * Newest last (so pop for undo gives most recent).
     */
    static async getActionHistory(windowId?: number): Promise<Action[]> {
        await this.hydrate();
        const list = this.actionHistory;
        if (windowId === undefined) return [...list];
        return list.filter((a: Action) => a.windowId === windowId);
    }

    /**
     * Undo the most recent action for the given window.
     * Returns the action that was undone, or null if none.
     * When clearing history, persists with skipActionHistoryPreserve so the cleared state is not overwritten.
     */
    static async undoLast(windowId: number): Promise<Action | null> {
        await this.hydrate();
        let idx = -1;
        for (let i = this.actionHistory.length - 1; i >= 0; i--) {
            if (this.actionHistory[i]!.windowId === windowId) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return null;

        const action = this.actionHistory[idx]!;
        this.actionHistory = this.actionHistory.filter((_, i) => i !== idx);
        this.notifyActionHistoryListeners();
        await this.persist({ skipActionHistoryPreserve: true });

        try {
            if (action.type === 'group') {
                const stillInWindow = await chrome.tabs.query({ windowId });
                const validIds = action.tabIds.filter(id => stillInWindow.some(t => t.id === id));
                if (validIds.length > 0) {
                    const tabIds = validIds as [number, ...number[]];
                    await chrome.tabs.ungroup(tabIds);
                }
            } else {
                for (const url of action.urls) {
                    await chrome.tabs.create({ url, windowId });
                }
            }
        } catch (e) {
            console.error('[StateService] Undo failed:', e);
            this.actionHistory = [...this.actionHistory, action].slice(-ACTION_HISTORY_MAX);
            this.notifyActionHistoryListeners();
            await this.persist();
            throw e;
        }
        return action;
    }

    /**
     * Subscribe to action-history changes (e.g. for Undo UI).
     * Callback receives the full history; filter by windowId in the consumer if needed.
     * Callbacks are notified immediately on push/undo so the UI updates without waiting for storage.
     */
    static subscribeActionHistory(callback: ActionHistoryListener): () => void {
        this.actionHistoryListeners.add(callback);
        const handler = (changes: StateChanges, areaName: string) => {
            if (areaName !== 'session' || !changes.actionHistory?.newValue) return;
            const raw = changes.actionHistory.newValue as Action[];
            if (Array.isArray(raw) && raw.length === 0 && this.actionHistory.length > 0) return;
            this.actionHistory = Array.isArray(raw) ? raw : [];
            callback(this.actionHistory);
        };
        chrome.storage.onChanged.addListener(handler);
        this.getActionHistory().then(callback);
        return () => {
            this.actionHistoryListeners.delete(callback);
            chrome.storage.onChanged.removeListener(handler);
        };
    }

    /**
     * Subscribe to changes for a specific window.
     * Returns a function to unsubscribe.
     * Callback receives:
     * 1. A Map<tabId, cache> for the specified window.
     * 2. A boolean indicating if the window is currently processing.
     */
    static subscribe(windowId: number, callback: (cache: Map<number, TabSuggestionCache>, isProcessing: boolean, duplicateCount: number) => void): () => void {
        const handleStorageChange = (changes: StateChanges, areaName: string) => {
            if (areaName !== 'session') return;

            let shouldNotify = false;

            if (changes.suggestionCache?.newValue) {
                const rawData = changes.suggestionCache.newValue as TabSuggestionCache[];
                this.cache = Array.isArray(rawData) ? buildWindowCache(rawData) : new Map();
                this.isHydrated = true;
                shouldNotify = true;
            }

            if (changes.windowSnapshots?.newValue) {
                this.snapshots = toNumberKeyedMap(changes.windowSnapshots.newValue as Record<string, string>);
                this.isHydrated = true;
            }

            if (changes.processingWindowIds?.newValue) {
                const rawData = changes.processingWindowIds.newValue as number[];
                const oldRawData = (changes.processingWindowIds.oldValue as number[]) || [];

                this.processingWindows = new Set(rawData);
                this.isHydrated = true;

                // Only notify if THIS window's status changed
                const wasProcessing = oldRawData.includes(windowId);
                const isProcessing = rawData.includes(windowId);

                if (wasProcessing !== isProcessing) {
                    shouldNotify = true;
                }
            }

            if (changes.duplicateCounts?.newValue) {
                const rawData = changes.duplicateCounts.newValue as Record<string, number>;
                const oldRawData = (changes.duplicateCounts.oldValue as Record<string, number>) || {};

                this.duplicateCounts = toNumberKeyedMap(rawData);
                this.isHydrated = true;

                if (rawData[windowId] !== oldRawData[windowId]) {
                    shouldNotify = true;
                }
            }

            if (shouldNotify) {
                const isProcessing = this.processingWindows.has(windowId);
                const windowCache = this.cache?.get(windowId) || new Map();
                const duplicateCount = this.duplicateCounts.get(windowId) || 0;
                callback(windowCache, isProcessing, duplicateCount);
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
     * Persist current in-memory cache to session storage.
     * When actionHistory is empty and skipActionHistoryPreserve is false, we preserve
     * whatever is in storage so the background never overwrites sidepanel history.
     * When skipActionHistoryPreserve is true (e.g. from undoLast after clearing), we
     * write empty and do not restore from storage.
     */
    private static async persist(opts?: { skipActionHistoryPreserve?: boolean }): Promise<void> {
        try {
            const update: Partial<StorageSchema> = {};
            if (this.cache) {
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
            update.duplicateCounts = Object.fromEntries(this.duplicateCounts.entries());

            let actionHistoryToWrite = this.actionHistory ?? [];
            if (actionHistoryToWrite.length === 0 && !opts?.skipActionHistoryPreserve) {
                const existing = (await chrome.storage.session.get('actionHistory')) as { actionHistory?: Action[] };
                if (Array.isArray(existing?.actionHistory) && existing.actionHistory.length > 0) {
                    actionHistoryToWrite = existing.actionHistory;
                    this.actionHistory = existing.actionHistory;
                }
            }
            update.actionHistory = actionHistoryToWrite;

            await chrome.storage.session.set(update);
        } catch (e) {
            console.error('[StateService] Failed to persist:', e);
        }
    }
}
