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
        let cleanResponse = responseText.trim();

        // Check for Markdown code blocks first
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
        const matches = [...cleanResponse.matchAll(jsonBlockRegex)];

        if (matches.length > 0) {
            // Use the last JSON block if multiple exist (often AI echoes input then gives output)
            cleanResponse = matches[matches.length - 1][1].trim();
        } else {
            // No markdown block? Try to find the JSON structure directly
            const firstBracket = cleanResponse.indexOf('[');
            const firstBrace = cleanResponse.indexOf('{');
            const start = (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) ? firstBracket : firstBrace;

            if (start !== -1) {
                const lastBracket = cleanResponse.lastIndexOf(']');
                const lastBrace = cleanResponse.lastIndexOf('}');
                const end = Math.max(lastBracket, lastBrace);

                if (end !== -1 && end > start) {
                    cleanResponse = cleanResponse.substring(start, end + 1).trim();
                }
            }
        }

        return JSON.parse(cleanResponse);
    } catch (e) {
        console.error("Failed to parse AI JSON response", e);
        return {};
    }
};

export const constructSystemPrompt = (customRules: string = ""): string => {
    return `You are an Expert Tab Organizer. Your goal is to help users maintain a clean workspace by clustering related tabs into cohesive, logically named groups.

    I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".
    Your task is to assign EACH "Ungrouped Tab" to a group.

    Objectives:
    1. MINIMIZE the total number of groups while MAXIMIZING the logical cohesion within each group.
    2. STRICTLY PREFER "Existing Groups" if a tab fits one. Use the EXACT name provided.
    3. Create NEW groups only for tabs that don't fit existing ones. 
    4. Group multiple related "Ungrouped Tabs" together into new logical clusters.

    Naming Standards for NEW groups:
    - Use 1 concise word if possible.
    - Title Case.
    - Logical and descriptive (avoid generic names like "Work" or "Other").

    CRITICAL INSTRUCTIONS:
    - Output ONLY a valid JSON array.
    - DO NOT echo the user input.

    Expected JSON Structure:
    [{"tabId": 123, "groupName": "🚀Project Alpha"}, {"tabId": 456, "groupName": "Existing Group Name"}]

    ${customRules.trim().length > 0 ? `\nAdditional Rules:\n${customRules}` : ''}`;
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
