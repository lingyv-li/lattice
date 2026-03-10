export interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
    existingGroupId?: number | null;
}

// Per-tab cached suggestion from background AI processing
export interface TabSuggestionCache {
    tabId: number;
    windowId: number;
    groupName: string | null;
    existingGroupId: number | null;
    timestamp: number;
}

export enum TabGroupMessageType {
    TriggerProcessing = 'TRIGGER_PROCESSING',
    RegenerateSuggestions = 'REGENERATE_SUGGESTIONS',
    DismissSuggestion = 'DISMISS_SUGGESTION'
}

export interface TabGroupMessage {
    type: TabGroupMessageType;
    windowId?: number;
    /** For DismissSuggestion: tab IDs of the rejected group */
    tabIds?: number[];
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}
