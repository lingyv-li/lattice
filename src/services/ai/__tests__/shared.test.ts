import { describe, it, expect } from 'vitest';
import { cleanAndParseJson, constructSystemPrompt, handleAssignment } from '../shared';
import { TabGroupSuggestion } from '../../types/tabGrouper';

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
        it('should include custom rules if provided', () => {
            const prompt = constructSystemPrompt('Custom Rule 1');
            expect(prompt).toContain('Additional Rules:');
            expect(prompt).toContain('Custom Rule 1');
        });

        it('should request JSON object format', () => {
            const prompt = constructSystemPrompt();
            expect(prompt).toContain('valid JSON object');
            expect(prompt).toContain('JSON Keys are the Group Names');
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
