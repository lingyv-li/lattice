import { TabGroupSuggestion } from '../../types/tabGrouper';
import JSON5 from 'json5';

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

export const cleanAndParseJson = (responseText: string): unknown => {
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
            const firstBracket = cleanResponse.indexOf('[');
            const firstBrace = cleanResponse.indexOf('{');
            let start = -1;
            if (firstBracket !== -1 && firstBrace !== -1) start = Math.min(firstBracket, firstBrace);
            else if (firstBracket !== -1) start = firstBracket;
            else if (firstBrace !== -1) start = firstBrace;

            const lastBracket = cleanResponse.lastIndexOf(']');
            const lastBrace = cleanResponse.lastIndexOf('}');
            let end = -1;
            end = Math.max(lastBracket, lastBrace);

            if (start !== -1 && end !== -1 && end > start) {
                cleanResponse = cleanResponse.substring(start, end + 1).trim();

            }
        }

        return JSON5.parse(cleanResponse);
    } catch (e) {
        console.error("Failed to parse AI JSON response", e);
        return {};
    }
};

// =============================================================================
// PROMPT COMPONENTS
// =============================================================================

const ROLE = `You are a Tab Organizer that groups browser tabs into logical categories.`;

const TASK = `I will provide "Existing Groups" and "Ungrouped Tabs". Assign each ungrouped tab to a group.`;

const OBJECTIVES = `Objectives:
- COMPULSORY: Check "Existing Groups" first. If a tab fits an existing group, you MUST use that EXACT group name.
- Do NOT create a new group if an existing one is suitable.
- Merge similar topics aggressively (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".`;

// --- Non-CoT (direct JSON output) ---
const INSTRUCTIONS = `OUTPUT FORMAT:
- Output ONLY a valid JSON array of objects.
- Each object must have "tabId" (number) and "groupName" (string).

Example:
[
  {"tabId": 101, "groupName": "Group A"},
  {"tabId": 102, "groupName": "Group A"},
  {"tabId": 103, "groupName": "Group B"}
]`;

// --- CoT (reasoning + JSON) ---
// --- CoD (Chain-of-Draft) ---
const COD_INSTRUCTIONS = `You MUST output a JSON list of assignments.

Think step by step, but only keep a minimum draft for each thinking step, with 5 words at most.
Return the draft, then the separator '####', then the JSON array wrapped in a markdown code block.

Format: List of objects with "tabId" and "groupName".

INPUT:
<example>
Existing Groups:
- "🛒Shopping"
Ungrouped Tabs:
- [ID: 101] "React hooks guide"
- [ID: 102] "Amazon.com: headphones"
- [ID: 103] "TypeScript handbook"
</example>

OUTPUT:
<example>
Thoughts:
1. ...
2. ...

####
\`\`\`json
[
  {"tabId": 101, "groupName": "⚛️React"},
  {"tabId": 102, "groupName": "🛒Shopping"},
  {"tabId": 103, "groupName": "⚛️React"}
]
\`\`\`
</example>`;

const CONSTRAINTS = `IMPORTANT:
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string. "tabId" must be a number.`;

// =============================================================================
// PROMPT CONSTRUCTION
// =============================================================================

export const constructSystemPrompt = (customRules: string = "", useReasoning: boolean = false): string => {
    const coreInstructions = useReasoning ? COD_INSTRUCTIONS : INSTRUCTIONS;

    const parts = [
        ROLE,
        TASK,
        OBJECTIVES,
        coreInstructions,
        CONSTRAINTS
    ];

    if (customRules.trim().length > 0) {
        parts.push(`Additional Rules:\n${customRules}`);
    }

    return parts.join('\n\n');
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
