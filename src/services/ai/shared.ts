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

    // This will throw if invalid
    return JSON5.parse(cleanResponse);
};

// =============================================================================
// PROMPT COMPONENTS
// =============================================================================

const ROLE = `## Role
You are an expert Information Architect and Productivity Assistant.`;

const TASK = `## Task
Organize the user's chaotic browser session into semantically coherent, context-aware groups.`;

const RULES = `## Rules
- Use EXACT SAME group name for all tabs in the same group (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".`;

// --- Non-CoT (direct JSON output) ---
const OUTPUT_FORMAT = `## Output Format
- Output ONLY a valid JSON array of objects.
- Each object must have "tabId" (number) and "groupName" (string).

## Example
[
  {"tabId": 101, "groupName": "..."},
  {"tabId": 102, "groupName": "..."},
  {"tabId": 103, "groupName": "..."}
]`;

// --- CoD (Chain-of-Draft) ---
const COD_OUTPUT_FORMAT = `## Output Format
You MUST output a JSON list of assignments.

Think step by step, but only keep a minimum draft for each thinking step, with 5 words at most.
Return the draft, then the separator '####', then the JSON array wrapped in a markdown code block.

Format: List of objects with "tabId" and "groupName".

## Example
<input>
<existing_groups>
- "🛒Shopping"
</existing_groups>
<ungrouped_tabs>
- [ID: 101] "React hooks guide"
- [ID: 102] "Amazon.com: headphones"
- [ID: 103] "TypeScript handbook"
</ungrouped_tabs>
</input>

<output>
Thoughts:
1. ...
2. ...

####
\`\`\`json
[
  {"tabId": 101, "groupName": "..."},
  {"tabId": 102, "groupName": "..."},
  {"tabId": 103, "groupName": "..."}
]
\`\`\`</output>`;

const CONSTRAINTS = `## Constraints
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string. "tabId" must be a number.`;

// =============================================================================
// PROMPT CONSTRUCTION
// =============================================================================

export const constructSystemPrompt = (customRules: string = "", useReasoning: boolean = false): string => {
    const parts = [
        ROLE,
        TASK,
        RULES + (customRules.trim().length > 0 ? '\n' + customRules : ""),
        useReasoning ? COD_OUTPUT_FORMAT : OUTPUT_FORMAT,
        CONSTRAINTS
    ];

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
