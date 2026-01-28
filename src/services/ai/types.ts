import { TabGroupSuggestion } from '../../types/tabGrouper';

export interface TabData {
    id: number;
    title: string;
    url: string;
}

export interface GroupContext {
    id: number;
    tabs: TabData[];
    lastActive?: number;
}

export interface GroupingRequest {
    existingGroups: Map<string, GroupContext>;
    ungroupedTabs: TabData[];
    customRules?: string;
    signal: AbortSignal;
}

export interface SuggestionResult {
    suggestions: TabGroupSuggestion[];
    errors: Error[];
}

export interface AIProvider {
    /**
     * Unique identifier for the provider (e.g., 'gemini', 'local')
     */
    id: string;

    /**
     * Process a list of tabs and return group assignments.
     * Returns both suggestions and any errors that occurred during processing.
     */
    generateSuggestions(request: GroupingRequest): Promise<SuggestionResult>;
}

export type UpdateNextIdFn = (id: number) => void;

export interface ModelInfo {
    id: string;
    displayName: string;
}
