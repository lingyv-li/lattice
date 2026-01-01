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
    type: 'SYNC_STATE';
    windowId?: number;
}

export interface TabGroupResponse {
    type: 'PROCESSING_STATUS';
    isProcessing?: boolean;
    error?: string;
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}
