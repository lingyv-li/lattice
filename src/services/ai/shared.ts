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

export type PromptStrategy = 'cloud' | 'local';

// --- CLOUD (SOTA - Gemini 1.5 Flash / 3.0 Flash) ---
const CLOUD_ROLE = `You are an expert Information Architect and Productivity Assistant (Cognitive Architect).`;
const CLOUD_TASK = `Organize the user's chaotic browser session into semantically coherent, context-aware groups.`;
const CLOUD_INSTRUCTIONS = `Reasoning Instructions (Chain-of-Thought):
- Analyze Intent: Do not rely solely on keywords. Reason about the user's goal. (e.g. "Stack Overflow" + "Pandas" = "Data Science").
- Handle Ambiguity: If a tab is generic, look at adjacent tabs to infer context.
- Hierarchy: Create groups that are mutually exclusive and collectively exhaustive.
- Naming: Generate concise, action-oriented group titles (e.g., "Debugging", "Reading List").

Output Format:
Return ONLY a valid JSON object matching this schema:
{
  "reasoning": "Brief summary of your grouping logic",
  "groups": [
    { "name": "string (with emoji)", "tab_ids": [integer] }
  ]
}`;

// --- LOCAL (Edge - Gemini Nano) ---
const LOCAL_ROLE = `You are a precise tab categorization engine (The Structuralist). Output strict JSON only.`;
const LOCAL_TASK = `Group the browser tabs into 3-5 logical categories.`;
const LOCAL_INSTRUCTIONS = `Strategy (Chain-of-Draft):
1. Draft: Identify main topics in < 5 words.
2. Group: Assign tabs to these topics.
3. Format: Output JSON.

Output Format:
Draft: [Topic 1, Topic 2, ...]
####
{
  "groups": [
    { "name": "string (with emoji)", "ids": [integer] }
  ]
}`;

const CONSTRAINTS = `IMPORTANT:
- Return exactly ONE assignment for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "name" must be a string. "ids" or "tab_ids" must be numbers.`;

// =============================================================================
// PROMPT CONSTRUCTION
// =============================================================================

export const constructSystemPrompt = (customRules: string = "", strategy: PromptStrategy = 'cloud'): string => {
    const isCloud = strategy === 'cloud';

    const role = isCloud ? CLOUD_ROLE : LOCAL_ROLE;
    const task = isCloud ? CLOUD_TASK : LOCAL_TASK;
    const instructions = isCloud ? CLOUD_INSTRUCTIONS : LOCAL_INSTRUCTIONS;

    const parts = [
        role,
        task,
        instructions,
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
