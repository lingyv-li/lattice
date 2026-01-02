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

export interface TabGroupMessage {
    type: 'TRIGGER_PROCESSING' | 'REGENERATE_SUGGESTIONS';
    windowId?: number;
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}
