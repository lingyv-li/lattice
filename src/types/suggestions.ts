export enum SuggestionType {
    Group = 'group',
    Deduplicate = 'deduplicate'
}

export interface SuggestionTab {
    title?: string;
    url?: string;
    favIconUrl?: string;
}

/**
 * Action: a suggestion (from background/UI) or an accepted action (for undo).
 * Used to pass suggestions from background to UI and to record the last N for undo.
 */
export type GroupAction = {
    type: 'group';
    windowId: number;
    tabIds: number[];
    groupName: string;
    existingGroupId?: number | null;
};

export type DeduplicateAction = {
    type: 'deduplicate';
    windowId: number;
    /** Normalized URL key (e.g. for duplicateGroups lookup) */
    url: string;
    /** URLs of tabs that would be closed (for undo) */
    urls: string[];
};

export type Action = GroupAction | DeduplicateAction;

export const ACTION_HISTORY_MAX = 10;
