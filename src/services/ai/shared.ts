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

const PROMPT_INTRO = `You are an Expert Tab Organizer. Your goal is to help users maintain a clean workspace by clustering related tabs into cohesive, logically named groups.

I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".`;

const COMMON_OBJECTIVES = `Objectives:
1. Aggressively merge similar topics. Avoid creating multiple small groups for the same subject (e.g., merge "Tech" and "Technology").
2. PREFER "Existing Groups" if a tab fits one. Use the EXACT name provided.
3. Create NEW groups only for tabs that definitively don't fit existing ones. 
4. Avoid single-tab groups unless absolutely necessary.

Naming Standards for NEW groups:
- Use 1-2 concise words (Title Case).
- Descriptive but broad enough to encompass multiple tabs.
- NO generic names like "Other", "Misc", "Tabs".`;

const COMMON_CONSTRAINTS = `IMPORTANT:
- Assign each tab ID to EXACTLY ONE group.
- Do not duplicate tab IDs across groups.`;

const INSTRUCTIONS = `
CRITICAL INSTRUCTIONS:
- Output ONLY a valid JSON object.
- Assign EACH "Ungrouped Tab" to a group.
- DO NOT echo the user input or explain your reasoning.
- The JSON Keys are the Group Names, and the Values are Arrays of Tab IDs.

Expected JSON Structure:
{
    "...": [123, 124, 129],
    "...": [456]
}`;

const COT_INSTRUCTIONS = `Step 1: Reasoning
For EACH tab, provide a concise explanation (a few words) about its content. You must process every tab in order.
Format:
[Tab ID]: [Concise Content Analysis]

Step 2: JSON Output
Based on the reasoning above, group the tabs.
Assign tabs to groups in a valid JSON object preceded by "@@JSON_START@@".

Expected JSON Structure:
@@JSON_START@@
{
    "...": [123, 124, 129],
    "...": [456]
}`;

export const constructSystemPrompt = (customRules: string = "", isCoT: boolean = false): string => {
    const coreInstructions = isCoT ? COT_INSTRUCTIONS : INSTRUCTIONS;

    return `${PROMPT_INTRO}

${COMMON_OBJECTIVES}

${coreInstructions}

${COMMON_CONSTRAINTS}

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
