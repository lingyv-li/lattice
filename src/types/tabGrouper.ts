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
