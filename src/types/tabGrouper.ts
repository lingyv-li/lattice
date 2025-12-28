export interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
}

export interface TabGroupMessage {
    type: 'START_GROUPING';
}

export interface TabGroupResponse {
    type: 'INITIALIZING' | 'SESSION_CREATED' | 'COMPLETE' | 'ERROR';
    value?: number;
    groups?: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    error?: string;
}
