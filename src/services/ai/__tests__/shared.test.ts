import { describe, it, expect } from 'vitest';
import { cleanAndParseJson, constructSystemPrompt, handleAssignment } from '../shared';
import { TabGroupSuggestion } from '../../../types/tabGrouper';

describe('shared utilities', () => {
    describe('cleanAndParseJson', () => {
        it('should parse raw JSON array (backward compatibility)', () => {
            const input = '[{"tabId": 1, "groupName": "Test"}]';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should parse raw JSON dictionary (new format)', () => {
            const input = '{"Test Group": [1, 2, 3]}';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({ "Test Group": [1, 2, 3] });
        });

        it('should parse JSON wrapped in markdown code blocks', () => {
            const input = '```json\n{"Test Group": [1]}\n```';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({ "Test Group": [1] });
        });

        it('should preferred earlier JSON object if multiple technically exist but find the structure correctly', () => {
            const input = 'Prefix { "Group": [1] } Suffix';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({ "Group": [1] });
        });

        it('should return empty object on completely malformed input', () => {
            const input = 'This is just plain text with no brackets';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({});
        });

        // JSON5 Specific Tests
        it('should parse JSON with trailing commas', () => {
            const input = '[{"tabId": 1, "groupName": "Test",}]';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should parse JSON with unquoted keys', () => {
            const input = '[{tabId: 1, groupName: "Test"}]';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should parse JSON with comments', () => {
            const input = `[
                // This is a comment
                {"tabId": 1, "groupName": "Test"}
            ]`;
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });
    });

    describe('constructSystemPrompt', () => {
        it('should match the golden prompt structure', () => {
            const prompt = constructSystemPrompt();
            const expected = `You are a Tab Organizer that groups browser tabs into logical categories.

I will provide "Existing Groups" and "Ungrouped Tabs". Assign each ungrouped tab to a group.

Objectives:
- COMPULSORY: Check "Existing Groups" first. If a tab fits an existing group, you MUST use that EXACT group name.
- Do NOT create a new group if an existing one is suitable.
- If a tab does not fit ANY group (existing or new), set "groupName" to null.
- Merge similar topics aggressively (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".

OUTPUT FORMAT:
- Output ONLY a valid JSON array of objects.
- Each object must have "tabId" (number) and "groupName" (string or null).
- Use null for "groupName" if the tab should not be grouped.

Example:
[
  {"tabId": 101, "groupName": "Group A"},
  {"tabId": 102, "groupName": null},
  {"tabId": 103, "groupName": "Group B"}
]

IMPORTANT:
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string or null. "tabId" must be a number.`;
            expect(prompt).toBe(expected);
        });

        it('should include custom rules if provided', () => {
            const prompt = constructSystemPrompt('Custom Rule 1');
            expect(prompt).toContain('Additional Rules:');
            expect(prompt).toContain('Custom Rule 1');
        });
    });

    describe('constructSystemPrompt (CoT)', () => {
        it('should match the golden prompt structure for readability', () => {
            const prompt = constructSystemPrompt("", true);

            // Golden test - ensure prompt structure stays consistent
            const expected = `You are a Tab Organizer that groups browser tabs into logical categories.

I will provide "Existing Groups" and "Ungrouped Tabs". Assign each ungrouped tab to a group.

Objectives:
- COMPULSORY: Check "Existing Groups" first. If a tab fits an existing group, you MUST use that EXACT group name.
- Do NOT create a new group if an existing one is suitable.
- If a tab does not fit ANY group (existing or new), set "groupName" to null.
- Merge similar topics aggressively (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".

You MUST output a JSON list of assignments.

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
</example>

IMPORTANT:
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string or null. "tabId" must be a number.`;

            expect(prompt).toBe(expected);
        });

        it('should match the golden prompt structure with custom rules', () => {
            const prompt = constructSystemPrompt("Rule 1: Be cool.\nRule 2: Have fun.", true);

            const expected = `You are a Tab Organizer that groups browser tabs into logical categories.

I will provide "Existing Groups" and "Ungrouped Tabs". Assign each ungrouped tab to a group.

Objectives:
- COMPULSORY: Check "Existing Groups" first. If a tab fits an existing group, you MUST use that EXACT group name.
- Do NOT create a new group if an existing one is suitable.
- If a tab does not fit ANY group (existing or new), set "groupName" to null.
- Merge similar topics aggressively (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".

You MUST output a JSON list of assignments.

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
</example>

IMPORTANT:
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string or null. "tabId" must be a number.

Additional Rules:
Rule 1: Be cool.
Rule 2: Have fun.`;

            expect(prompt).toBe(expected);
        });
    });

    describe('handleAssignment', () => {
        it('should normalize group names (trim)', () => {
            const groupMap = new Map<string, number>();
            const suggestions = new Map<string, TabGroupSuggestion>();
            const nextId = -1;

            handleAssignment('  Trim Me  ', 1, groupMap, suggestions, nextId);

            expect(groupMap.has('Trim Me')).toBe(true);
            expect([...suggestions.values()][0].groupName).toBe('Trim Me');
        });

        it('should NOT match existing groups case-insensitively (exact match only)', () => {
            const groupMap = new Map<string, number>();
            groupMap.set('Existing Group', 100);
            const suggestions = new Map<string, TabGroupSuggestion>();

            // "existing group" should NOT match "Existing Group"
            handleAssignment('existing group', 1, groupMap, suggestions, -1);

            const suggestion = [...suggestions.values()][0];
            expect(suggestion.existingGroupId).toBeNull(); // New group created
            expect(suggestion.groupName).toBe('existing group');
        });

        it('should create new group if no match found', () => {
            const groupMap = new Map<string, number>();
            const suggestions = new Map<string, TabGroupSuggestion>();

            const nextId = handleAssignment('New Group', 1, groupMap, suggestions, -1);

            expect(nextId).toBe(-2);
            expect(groupMap.get('New Group')).toBe(-1);
            const suggestion = [...suggestions.values()][0];
            expect(suggestion.existingGroupId).toBeNull();
        });
    });
});
