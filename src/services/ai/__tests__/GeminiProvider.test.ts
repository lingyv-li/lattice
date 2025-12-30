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

    it('should throw error if API key is missing', async () => {
        const noKeyProvider = new GeminiProvider('', 'gemini-pro');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: []
        };
        await expect(noKeyProvider.generateSuggestions(request, () => { })).rejects.toThrow("API Key is missing");
    });

    it('should process tabs in batches', async () => {
        // Create 15 tabs to force 2 batches (batch size is 10)
        const tabs = Array.from({ length: 15 }, (_, i) => ({
            id: i + 1,
            title: `Tab ${i + 1}`,
            url: `http://site${i + 1}.com`
        }));

        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: tabs
        };

        // Mock response
        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify({
                assignments: tabs.map(t => ({ tabId: t.id, groupName: 'Group A' }))
            })
        });

        await provider.generateSuggestions(request, () => { });

        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
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
            text: JSON.stringify({
                assignments: [
                    { tabId: 1, groupName: 'Shopping' },
                    { tabId: 2, groupName: 'Shopping' }
                ]
            })
        });

        const suggestions = await provider.generateSuggestions(request, () => { });

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].groupName).toBe('Shopping');
        expect(suggestions[0].tabIds).toEqual([1, 2]);
        expect(suggestions[0].existingGroupId).toBeNull();
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
            text: JSON.stringify({
                assignments: [{ tabId: 1, groupName: 'Work' }]
            })
        });

        const suggestions = await provider.generateSuggestions(request, () => { });

        expect(suggestions[0].existingGroupId).toBe(100);
    });

    it('should handle malformed JSON response gracefully', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockResolvedValue({
            text: "This is not JSON"
        });

        const suggestions = await provider.generateSuggestions(request, () => { });
        expect(suggestions).toEqual([]);
    });

    it('should handle empty response text gracefully', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockResolvedValue({}); // No text

        const suggestions = await provider.generateSuggestions(request, () => { });
        expect(suggestions).toEqual([]);
    });
});
