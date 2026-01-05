import { TabGroupSuggestion } from '../../types/tabGrouper';
import JSON5 from 'json5';

export const handleAssignment = (
    groupName: string | null,
    tabId: number,
    groupMap: Map<string, number>,
    suggestions: Map<string, TabGroupSuggestion>,
    currentNextId: number
): number => {
    // 0. Explicitly check for null (intent to NOT group)
    if (groupName === null) {
        return currentNextId;
    }

    let targetGroupId: number;
    let updatedNextId = currentNextId;

    // 1. Normalize the group name (basic trim only)
    const normalizedName = groupName ? groupName.trim() : "";

    // 2. Validate
    if (normalizedName.length === 0) {
        // Fallback for empty group name (only if it was an empty string, not null)
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
- If a tab does not fit ANY group (existing or new), set "groupName" to null.
- Merge similar topics aggressively (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".`;

// --- Non-CoT (direct JSON output) ---
const INSTRUCTIONS = `OUTPUT FORMAT:
- Output ONLY a valid JSON array of objects.
- Each object must have "tabId" (number) and "groupName" (string or null).
- Use null for "groupName" if the tab should not be grouped.

Example:
[
  {"tabId": 101, "groupName": "Group A"},
  {"tabId": 102, "groupName": null},
  {"tabId": 103, "groupName": "Group B"}
]`;

// --- CoT (reasoning + JSON) ---
const COT_INSTRUCTIONS = `You MUST output a JSON list of assignments.

Step 1: Briefly annotate and expand on each tab (a few words per tab).
Step 2: Identify common themes. List top themes and proposed group names.
Step 3: Output the JSON array wrapped in a markdown code block.

Format: List of objects with "tabId" and "groupName".

<example>
INPUT:
Existing Groups:
- "🛒Shopping"
Ungrouped Tabs:
- [ID: 101] "React hooks guide"
- [ID: 102] "Amazon.com: headphones"
- [ID: 103] "Localhost:3000"

OUTPUT:
Step 1: Annotations
- 101: React JavaScript coding (Dev).
- 102: Shopping for headphones.
- 103: Local dev server (Standalone).

Step 2: Themes
- 🛒Shopping (Existing)
- ⚛️React (New)

Step 3: JSON
\`\`\`json
[
  {"tabId": 101, "groupName": "⚛️React"},
  {"tabId": 102, "groupName": "🛒Shopping"},
  {"tabId": 103, "groupName": null}
]
\`\`\`
</example>`;

const CONSTRAINTS = `IMPORTANT:
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string or null. "tabId" must be a number.`;

// =============================================================================
// PROMPT CONSTRUCTION
// =============================================================================

export const constructSystemPrompt = (customRules: string = "", isCoT: boolean = false): string => {
    const coreInstructions = isCoT ? COT_INSTRUCTIONS : INSTRUCTIONS;

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
