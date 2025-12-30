import { TabGroupSuggestion, GroupingContext } from '../types/tabGrouper';
import { getSettings } from './storage';
import { AIService } from '../services/ai/AIService';
import { GroupingRequest } from '../services/ai/types';

export const generateTabGroupSuggestions = async (
    context: GroupingContext,
    onProgress: (progress: number) => void,
    onSessionCreated?: () => void
): Promise<TabGroupSuggestion[]> => {

    // 0. Fetch settings
    const appSettings = await getSettings();

    // 1. Get Provider
    const provider = await AIService.getProvider(appSettings);

    // 2. Prepare Request
    // Map existing groups context to the format expected by the service
    const groupNameMap = mapExistingGroups(context.existingGroups);

    const request: GroupingRequest = {
        existingGroups: groupNameMap,
        ungroupedTabs: context.ungroupedTabs,
        customRules: appSettings.customGroupingRules
    };

    // 3. Generate
    // Note: onSessionCreated callback for local provider is not explicitly handled in the generic interface 
    // because it was a specific hook for the UI. 
    // If needed, we could add it to the provider interface, but for now we assume the provider handles its own init.
    // The original code called it after `ensureLocalSession`. 
    // Since `provider.generateSuggestions` handles init internally, we might miss this fine-grained progress step 
    // but the functionality remains.
    if (onSessionCreated && provider.id === 'local') {
        onSessionCreated();
    }

    return await provider.generateSuggestions(request, onProgress);
};

// --- Helpers ---

// Helper: Map Existing Groups
const mapExistingGroups = (groups: { id: number, title?: string }[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const group of groups) {
        if (group.title && group.title.trim().length > 0) {
            if (!map.has(group.title)) {
                map.set(group.title, group.id);
            }
        }
    }
    return map;
};
