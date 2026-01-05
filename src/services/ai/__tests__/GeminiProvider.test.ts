import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../GeminiProvider';
import { GroupingRequest } from '../types';

// Mock SettingsStorage
vi.mock('../../../utils/storage', () => ({
    SettingsStorage: {
        getApiKey: vi.fn().mockResolvedValue('fake-api-key')
    },
    AIProviderType: {
        Gemini: 'gemini',
        Local: 'local'
    }
}));

// Mock @google/generative-ai
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent
});

vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: class {
            constructor() {}
            getGenerativeModel = mockGetGenerativeModel;
        }
    };
});

describe('GeminiProvider', () => {
    let provider: GeminiProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new GeminiProvider();
    });

    it('should collect error if API key is missing', async () => {
        // Mock SettingsStorage to return null
        const { SettingsStorage } = await import('../../../utils/storage');
        vi.mocked(SettingsStorage.getApiKey).mockResolvedValueOnce(null);

        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('No Gemini API key found');
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
            response: {
                text: () => JSON.stringify({
                    "groups": [{ "name": "Shopping", "tab_ids": [1, 2] }]
                })
            }
        });

        const result = await provider.generateSuggestions(request);

        if (result.errors.length > 0) {
            console.error("Errors:", result.errors);
        }

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
            response: {
                text: () => JSON.stringify({
                   "groups": [{ "name": "Work", "tab_ids": [1] }]
                })
            }
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
            response: {
                text: () => "This is not JSON"
            }
        });

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(0);
    });

    it('should propagate prompt errors', async () => {
         const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }]
        };

        mockGenerateContent.mockRejectedValue(new Error("API Error"));

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe("API Error");
    });
});
