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

        it('should throw error on completely malformed input', () => {
            const input = 'This is just plain text with no brackets';
            expect(() => cleanAndParseJson(input)).toThrow();
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
            const expected = `## Role
You are an expert Information Architect and Productivity Assistant.

## Task
Organize the user's chaotic browser session into semantically coherent, context-aware groups.

## Rules
- Use EXACT SAME group name for all tabs in the same group (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".

## Output Format
- Output ONLY a valid JSON array of objects.
- Each object must have "tabId" (number) and "groupName" (string).

## Example
[
  {"tabId": 101, "groupName": "..."},
  {"tabId": 102, "groupName": "..."},
  {"tabId": 103, "groupName": "..."}
]

## Constraints
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string. "tabId" must be a number.`;
            expect(prompt).toBe(expected);
        });

        const prompt = constructSystemPrompt('Custom Rule 1');
        // Check that it's appended to Rules
        expect(prompt).toContain('## Rules');
        expect(prompt).toContain('Custom Rule 1');
        // And that it doesn't add a new header if not implemented that way anymore
        // Based on shared.ts implementation: RULES + (customRules ... ? '\n' + customRules : "")
        expect(prompt).not.toContain('## Additional Rules');
    });

    describe('constructSystemPrompt (CoD)', () => {
        it('should match the golden prompt structure for readability', () => {
            const prompt = constructSystemPrompt("", true);

            // Golden test - ensure prompt structure stays consistent
            const expected = `## Role
You are an expert Information Architect and Productivity Assistant.

## Task
Organize the user's chaotic browser session into semantically coherent, context-aware groups.

## Rules
- Use EXACT SAME group name for all tabs in the same group (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".

## Output Format
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
\`\`\`</output>

## Constraints
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string. "tabId" must be a number.`;

            expect(prompt).toBe(expected);
        });

        it('should match the golden prompt structure with custom rules', () => {
            const prompt = constructSystemPrompt("Rule 1: Be cool.\nRule 2: Have fun.", true);

            const expected = `## Role
You are an expert Information Architect and Productivity Assistant.

## Task
Organize the user's chaotic browser session into semantically coherent, context-aware groups.

## Rules
- Use EXACT SAME group name for all tabs in the same group (e.g., "Tech" and "Technology" → pick one).
- New group names: 1-2 words, Title Case, no generic names like "Other" or "Misc".
Rule 1: Be cool.
Rule 2: Have fun.

## Output Format
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
\`\`\`</output>

## Constraints
- Return exactly ONE object for EVERY tab ID in the input.
- Do NOT skip any tabs.
- "groupName" must be a string. "tabId" must be a number.`;

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
