export interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
    existingGroupId?: number | null;
}

export interface TabGroupMessage {
    type: 'START_GROUPING';
}

export interface TabGroupResponse {
    type: 'INITIALIZING' | 'SESSION_CREATED' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
    value?: number;
    groups?: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    error?: string;
}

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}

export type TabGrouperStatus = 'idle' | 'initializing' | 'processing' | 'reviewing' | 'success' | 'error';
