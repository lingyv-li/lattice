export interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
    existingGroupId?: number | null;
}

// Per-tab cached suggestion from background AI processing
export interface TabSuggestionCache {
    tabId: number;
    groupName: string;
    existingGroupId: number | null;
    timestamp: number;
}

export interface TabGroupMessage {
    type: 'START_GROUPING' | 'GET_CACHED_SUGGESTIONS' | 'REJECT_SUGGESTIONS';
    rejectedTabIds?: number[];
    windowId?: number;
}

export interface TabGroupResponse {
    type: 'INITIALIZING' | 'SESSION_CREATED' | 'PROGRESS' | 'COMPLETE' | 'ERROR' | 'CACHED_SUGGESTIONS' | 'PROCESSING_STATUS';
    value?: number;
    groups?: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    cachedSuggestions?: TabSuggestionCache[];
    processingCount?: number;
    error?: string;
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}

export type TabGrouperStatus = 'idle' | 'initializing' | 'processing' | 'reviewing' | 'success' | 'error';
