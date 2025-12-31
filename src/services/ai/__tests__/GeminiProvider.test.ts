import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../GeminiProvider';
import { GroupingRequest } from '../types';

// Mock @google/genai
const mockGenerateContent = vi.fn();
const mockList = vi.fn();

vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class {
            models = {
                generateContent: mockGenerateContent,
                list: mockList
            };
        }
    };
});

describe('GeminiProvider', () => {
    let provider: GeminiProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new GeminiProvider('fake-api-key', 'gemini-pro');
    });

    it('should collect error if API key is missing', async () => {
        const noKeyProvider = new GeminiProvider('', 'gemini-pro');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        const result = await noKeyProvider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('API Key is missing');
    });

    it('should correctly handle assignments and group mapping', async () => {
        const tabs = [
            { id: 1, title: 'Shop 1', url: 'http://shop.com/1' },
            { id: 2, title: 'Shop 2', url: 'http://shop.com/2' }
        ];
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: tabs
        };

        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify([
                { tabId: 1, groupName: 'Shopping' },
                { tabId: 2, groupName: 'Shopping' }
            ])
        });

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].groupName).toBe('Shopping');
        expect(result.suggestions[0].tabIds).toEqual([1, 2]);
        expect(result.suggestions[0].existingGroupId).toBeNull();
        expect(result.errors).toHaveLength(0);
    });

    it('should use existing group ID if AI returns existing name', async () => {
        const existingGroups = new Map<string, number>();
        existingGroups.set('Work', 100);

        const tabs = [{ id: 1, title: 'Work Doc', url: 'http://docs.com' }];
        const request: GroupingRequest = {
            existingGroups,
            ungroupedTabs: tabs
        };

        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify([
                { tabId: 1, groupName: 'Work' }
            ])
        });

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions[0].existingGroupId).toBe(100);
    });

    it('should handle malformed JSON response gracefully', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockResolvedValue({
            text: "This is not JSON"
        });

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        // Malformed JSON doesn't throw, it's handled gracefully
        expect(result.errors).toHaveLength(0);
    });

    it('should collect error on empty response text', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockResolvedValue({}); // No text

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('No response text');
    });
    it('should handle Gemma models differently (no system instruction in config)', async () => {
        const gemmaProvider = new GeminiProvider('fake-key', 'gemma-2-9b-it');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify([])
        });

        await gemmaProvider.generateSuggestions(request);

        const callArgs = mockGenerateContent.mock.calls[0][0];

        // Config should be empty for Gemma
        expect(callArgs.config).toEqual({});

        // System prompt should be injected into user prompt
        const promptText = callArgs.contents[0].parts[0].text;
        expect(promptText).toContain('System Instructions:');
        expect(promptText).toContain('Output ONLY valid JSON'); // Adjusted casing to match implementation if needed, checking insensitive? No, implementation has "Output ONLY valid JSON." vs "IMPORTANT: Output ONLY valid JSON."
        // Implementation: `System Instructions: ${systemPrompt}\n\nIMPORTANT: Output ONLY valid JSON.\n\nUser Request: ${userPrompt}`
        expect(promptText).toContain('IMPORTANT: Output ONLY valid JSON');
    });
});

