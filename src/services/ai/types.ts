import { TabGroupSuggestion } from '../../types/tabGrouper';

export interface TabData {
    id: number;
    title: string;
    url: string;
}

export interface GroupingRequest {
    existingGroups: Map<string, number>;
    ungroupedTabs: TabData[];
    customRules?: string;
}

export interface AIProvider {
    /**
     * Unique identifier for the provider (e.g., 'gemini', 'local')
     */
    id: string;

    /**
     * Process a list of tabs and return group assignments.
     * Providers can implement their own batching or sequential logic here.
     */
    generateSuggestions(
        request: GroupingRequest,
        onProgress: (progress: number) => void
    ): Promise<TabGroupSuggestion[]>;
}

export type UpdateNextIdFn = (id: number) => void;

export interface ModelInfo {
    id: string;
    displayName: string;
}
