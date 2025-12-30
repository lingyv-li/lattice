export interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
    existingGroupId?: number | null;
}

// Per-tab cached suggestion from background AI processing
export interface TabSuggestionCache {
    tabId: number;
    groupName: string | null;
    existingGroupId: number | null;
    timestamp: number;
}

export interface TabGroupMessage {
    type: 'SYNC_STATE';
    windowId?: number;
}

export interface TabGroupResponse {
    type: 'INITIALIZING' | 'SESSION_CREATED' | 'PROGRESS' | 'COMPLETE' | 'ERROR' | 'PROCESSING_STATUS';
    value?: number;
    groups?: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    isProcessing?: boolean;
    error?: string;
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}


export enum TabGrouperStatus {
    Idle = 'idle',
    Initializing = 'initializing',
    Processing = 'processing',
    Reviewing = 'reviewing',
    Success = 'success',
    Error = 'error'
}
