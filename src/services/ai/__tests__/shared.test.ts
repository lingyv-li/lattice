import { describe, it, expect } from 'vitest';
import { cleanAndParseJson, constructSystemPrompt } from '../shared';

describe('shared utilities', () => {
    describe('cleanAndParseJson', () => {
        it('should parse raw JSON array', () => {
            const input = '[{"tabId": 1, "groupName": "Test"}]';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should parse JSON wrapped in markdown code blocks', () => {
            const input = '```json\n[{"tabId": 1, "groupName": "Test"}]\n```';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should parse JSON with leading text (the prefix issue)', () => {
            const input = 'Model generates raw response with PromptApi: Existing Groups: - 🗼Tokyo Ungrouped Tabs: - [ID: 1] Title: Test JSON Output: ```json [{"tabId": 1, "groupName": "Extensions"}] ```';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Extensions' }]);
        });

        it('should parse JSON with trailing text', () => {
            const input = '[{"tabId": 1, "groupName": "Test"}] and some extra stuff';
            const result = cleanAndParseJson(input);
            expect(result).toEqual([{ tabId: 1, groupName: 'Test' }]);
        });

        it('should handle nested JSON objects', () => {
            const input = 'Some text {"key": {"nested": [1, 2, 3]}} some more text';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({ key: { nested: [1, 2, 3] } });
        });

        it('should return empty object on completely malformed input', () => {
            const input = 'This is just plain text with no brackets';
            const result = cleanAndParseJson(input);
            expect(result).toEqual({});
        });

        it('should return empty object on invalid JSON structure', () => {
            const input = '[{"tabId": 1, "groupName": "Test"}'; // Missing closing bracket
            const result = cleanAndParseJson(input);
            expect(result).toEqual({});
        });
    });

    describe('constructSystemPrompt', () => {
        it('should contain critical instructions for JSON formatting', () => {
            const prompt = constructSystemPrompt();
            expect(prompt).toContain('CRITICAL INSTRUCTIONS:');
            expect(prompt).toContain('Output ONLY a valid JSON array');
            expect(prompt).toContain('DO NOT include any introductory text');
            expect(prompt).toContain('Start your response directly with \'[\' and end with \']\'');
        });

        it('should include custom rules if provided', () => {
            const prompt = constructSystemPrompt('Custom Rule 1');
            expect(prompt).toContain('Additional Rules:');
            expect(prompt).toContain('Custom Rule 1');
        });
    });
});
