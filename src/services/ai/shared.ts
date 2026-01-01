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

    // 1. Normalize the group name (basic trim only)
    const normalizedName = groupName ? groupName.trim() : "";

    // 2. Validate
    if (normalizedName.length === 0) {
        // Fallback for empty group name
        targetGroupId = updatedNextId--;
    } else {
        // 3. Direct lookup for existing groups
        if (groupMap.has(normalizedName)) {
            targetGroupId = groupMap.get(normalizedName)!;
        } else {
            // New group
            targetGroupId = updatedNextId--;
            // Add to map to ensure consistency for subsequent items in this batch
            groupMap.set(normalizedName, targetGroupId);
        }
    }

    const key = `group-id-${targetGroupId}`;
    if (!suggestions.has(key)) {
        suggestions.set(key, {
            groupName: normalizedName || "Ungrouped",
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
            // Use the last JSON block if multiple exist
            cleanResponse = matches[matches.length - 1][1].trim();
        } else {
            // No markdown block? Try to find the JSON structure directly
            // We favor Objects '{}' now, but keep Array '[]' support just in case
            const start = Math.min(cleanResponse.indexOf('['), cleanResponse.indexOf('{'));
            const end = Math.max(cleanResponse.lastIndexOf(']'), cleanResponse.lastIndexOf('}'));

            if (start !== -1 && end !== -1 && end > start) {
                cleanResponse = cleanResponse.substring(start, end + 1).trim();

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
    1. Aggressively merge similar topics. Avoid creating multiple small groups for the same subject (e.g., merge "Tech" and "Technology").
    2. STRICTLY PREFER "Existing Groups" if a tab fits one. Match the name exactly from the provided list.
    3. Create NEW groups only for tabs that definitively don't fit existing ones. 
    4. Avoid single-tab groups unless absolutely necessary.

    Naming Standards for NEW groups:
    - Use 1-2 concise words (Title Case).
    - Descriptive but broad enough to encompass multiple tabs.
    - NO generic names like "Other", "Misc", "Tabs".

    CRITICAL INSTRUCTIONS:
    - Output ONLY a valid JSON object.
    - DO NOT echo the user input or explain your reasoning.
    - The JSON Keys are the Group Names, and the Values are Arrays of Tab IDs.

    Expected JSON Structure:
    {
        "🚀Project Alpha": [123, 124, 129],
        "💡Existing Group Name": [456],
        "📝Documentation": [789]
    }

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
