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

        it('should prefer earlier JSON object if multiple technically exist but find the structure correctly', () => {
            const input = 'Prefix { "Group": [1] } Suffix';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({ "Group": [1] });
        });

        it('should return empty object on completely malformed input', () => {
            const input = 'This is just plain text with no brackets';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({});
        });
    });

    describe('constructSystemPrompt', () => {
        it('should match the golden prompt structure', () => {
            const prompt = constructSystemPrompt();
            const expected = `You are an Expert Tab Organizer. Your goal is to help users maintain a clean workspace by clustering related tabs into cohesive, logically named groups.

I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".

Objectives:
1. Aggressively merge similar topics. Avoid creating multiple small groups for the same subject (e.g., merge "Tech" and "Technology").
2. PREFER "Existing Groups" if a tab fits one. Use the EXACT name provided.
3. Create NEW groups only for tabs that definitively don't fit existing ones. 
4. Avoid single-tab groups unless absolutely necessary.

Naming Standards for NEW groups:
- Use 1-2 concise words (Title Case).
- Descriptive but broad enough to encompass multiple tabs.
- NO generic names like "Other", "Misc", "Tabs".


CRITICAL INSTRUCTIONS:
- Output ONLY a valid JSON object.
- Assign EACH "Ungrouped Tab" to a group.
- DO NOT echo the user input or explain your reasoning.
- The JSON Keys are the Group Names, and the Values are Arrays of Tab IDs.

Expected JSON Structure:
{
    "...": [123, 124, 129],
    "...": [456]
}

IMPORTANT:
- Assign each tab ID to EXACTLY ONE group.
- Do not duplicate tab IDs across groups.

`;
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

            // Reconstructing the expected string here to serve as a "Golden Test"
            // This ensures the prompt remains readable and follows the expected structure.
            const expected = `You are an Expert Tab Organizer. Your goal is to help users maintain a clean workspace by clustering related tabs into cohesive, logically named groups.

I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".

Objectives:
1. Aggressively merge similar topics. Avoid creating multiple small groups for the same subject (e.g., merge "Tech" and "Technology").
2. PREFER "Existing Groups" if a tab fits one. Use the EXACT name provided.
3. Create NEW groups only for tabs that definitively don't fit existing ones. 
4. Avoid single-tab groups unless absolutely necessary.

Naming Standards for NEW groups:
- Use 1-2 concise words (Title Case).
- Descriptive but broad enough to encompass multiple tabs.
- NO generic names like "Other", "Misc", "Tabs".

Step 1: Reasoning
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
}

IMPORTANT:
- Assign each tab ID to EXACTLY ONE group.
- Do not duplicate tab IDs across groups.

`;

            // Normalizing whitespace for comparison to avoid brittleness with minor spacing changes
            // but keeping the test expectation string readable above.
            expect(prompt).toBe(expected);
        });

        it('should match the golden prompt structure with custom rules', () => {
            const prompt = constructSystemPrompt("Rule 1: Be cool.\nRule 2: Have fun.", true);

            const expected = `You are an Expert Tab Organizer. Your goal is to help users maintain a clean workspace by clustering related tabs into cohesive, logically named groups.

I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".

Objectives:
1. Aggressively merge similar topics. Avoid creating multiple small groups for the same subject (e.g., merge "Tech" and "Technology").
2. PREFER "Existing Groups" if a tab fits one. Use the EXACT name provided.
3. Create NEW groups only for tabs that definitively don't fit existing ones. 
4. Avoid single-tab groups unless absolutely necessary.

Naming Standards for NEW groups:
- Use 1-2 concise words (Title Case).
- Descriptive but broad enough to encompass multiple tabs.
- NO generic names like "Other", "Misc", "Tabs".

Step 1: Reasoning
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
}

IMPORTANT:
- Assign each tab ID to EXACTLY ONE group.
- Do not duplicate tab IDs across groups.


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
