import { TabGroupSuggestion } from '../../types/tabGrouper';

export const handleAssignment = (
    groupName: string,
    tabId: number,
    groupMap: Map<string, number>,
    suggestions: Map<string, TabGroupSuggestion>,
    currentNextId: number
): number => {
    let targetGroupId: number;
    let updatedNextId = currentNextId;

    if (groupMap.has(groupName)) {
        targetGroupId = groupMap.get(groupName)!;
    } else if (groupName && groupName.trim().length > 0) {
        targetGroupId = updatedNextId--;
        groupMap.set(groupName, targetGroupId);
    } else {
        // Fallback for empty group name (shouldn't happen with good AI)
        targetGroupId = updatedNextId--;
    }

    const key = `group-id-${targetGroupId}`;
    if (!suggestions.has(key)) {
        suggestions.set(key, {
            groupName: groupName,
            tabIds: [],
            existingGroupId: targetGroupId >= 0 ? targetGroupId : null
        });
    }
    suggestions.get(key)!.tabIds.push(tabId);

    return updatedNextId;
};

export const cleanAndParseJson = (responseText: string): any => {
    try {
        const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanResponse);
    } catch (e) {
        console.error("Failed to parse AI JSON response", e);
        return {};
    }
};

export const constructSystemPrompt = (customRules: string = "", isBatch: boolean = false): string => {
    return `You are a browser tab organizer. 
    I will provide a list of "Existing Groups" and ${isBatch ? 'a list of "Ungrouped Tabs"' : 'a SINGLE "Ungrouped Tab"'}.
    Your task is to assign ${isBatch ? 'EACH "Ungrouped Tab"' : 'the "Ungrouped Tab"'} to a group.

    Rules:
    1. STRICTLY PREFER "Existing Groups". If the tab fits an existing group, you MUST use that EXACT name.
    2. Only create a NEW group name if the tab clearly does NOT fit any existing group.
    3. Use short, concise names for new groups (max 3 words).
    4. Do not include any markdown formatting or explanation.
    5. Output ONLY a valid JSON object with the following structure:
    ${isBatch ? '{"assignments": [{"tabId": number, "groupName": string}]}' : '{"groupName": string}'}
    ${customRules.trim().length > 0 ? `\n\nAdditional Rules:\n${customRules}` : ''}`;
};

export const mapExistingGroups = (groups: { id: number, title?: string }[]): Map<string, number> => {
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
