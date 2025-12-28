import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { generateTabGroupSuggestions } from './ai';
import { GroupingContext } from '../types/tabGrouper';
import { getSettings } from './storage';


// Setup global mock for LanguageModel
const mockPrompt = vi.fn();
const mockCreate = vi.fn();

// Mock storage module
vi.mock('./storage', () => ({
    getSettings: vi.fn(),
    DEFAULT_SETTINGS: {
        scanMissing: true,
        scanInterrupted: true,
        customGroupingRules: "",
        aiProvider: 'local',
        aiModel: '',
        geminiApiKey: ""
    }
}));

// Add LanguageModel to global object
// @ts-ignore
global.LanguageModel = {
    create: mockCreate,
    availability: async () => 'available'
};

// @ts-ignore
global.self = global;

describe('generateTabGroupSuggestions', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementation
        mockCreate.mockResolvedValue({
            prompt: mockPrompt,
            destroy: vi.fn()
        });

        (getSettings as Mock).mockResolvedValue({
            scanMissing: true,
            scanInterrupted: true,
            customGroupingRules: "",
            aiProvider: 'local',
            aiModel: '',
            geminiApiKey: ""
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should map to existing group ID when AI returns known group name', async () => {
        // Setup existing groups
        const context: GroupingContext = {
            existingGroups: [
                { id: 101, title: 'Work' },
                { id: 102, title: 'Social' }
            ],
            ungroupedTabs: [
                { id: 1, title: 'GitHub', url: 'https://github.com' }
            ]
        };

        // UI returns "Work", which maps to 101
        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'Work' }));

        const suggestions = await generateTabGroupSuggestions(
            context,
            () => { }, // onProgress
            () => { }  // onSessionCreated
        );

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].groupName).toBe('Work');
        expect(suggestions[0].existingGroupId).toBe(101);
    });

    it('should assign negative ID for new group name', async () => {
        const context: GroupingContext = {
            existingGroups: [],
            ungroupedTabs: [
                { id: 1, title: 'News', url: 'https://news.com' }
            ]
        };

        // UI returns "News", which is new
        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'News' }));

        const suggestions = await generateTabGroupSuggestions(
            context,
            () => { },
            () => { }
        );

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].groupName).toBe('News');
        expect(suggestions[0].existingGroupId).toBeNull();
    });

    it('should group multiple tabs into same new group with same negative ID', async () => {
        const context: GroupingContext = {
            existingGroups: [],
            ungroupedTabs: [
                { id: 1, title: 'News 1', url: 'https://news.com/1' },
                { id: 2, title: 'News 2', url: 'https://news.com/2' }
            ]
        };

        // UI returns "News" for both
        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'News' }));

        const suggestions = await generateTabGroupSuggestions(
            context,
            () => { },
            () => { }
        );

        expect(suggestions).toHaveLength(1); // One group suggestion
        expect(suggestions[0].groupName).toBe('News');
        expect(suggestions[0].tabIds).toEqual([1, 2]);
        expect(suggestions[0].existingGroupId).toBeNull();
    });

    it('should use first matching group when existing groups have duplicate names', async () => {
        const context: GroupingContext = {
            existingGroups: [
                { id: 201, title: 'Project A' },
                { id: 202, title: 'Project A' } // Duplicate name
            ],
            ungroupedTabs: [
                { id: 1, title: 'Task', url: 'https://task.com' }
            ]
        };

        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'Project A' }));

        const suggestions = await generateTabGroupSuggestions(
            context,
            () => { },
            () => { }
        );

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].existingGroupId).toBe(201); // Should allow map to first ID
    });

    it('should ignore empty string group names', async () => {
        const context: GroupingContext = {
            existingGroups: [
                { id: 301, title: 'Valid' },
                { id: 302, title: '' },      // Empty
                { id: 303, title: '   ' }    // Whitespace
            ],
            ungroupedTabs: [
                { id: 1, title: 'Tab 1', url: '...' },
                { id: 2, title: 'Tab 2', url: '...' }
            ]
        };

        // First tab: AI returns empty string (simulating bad output)
        mockPrompt.mockResolvedValueOnce(JSON.stringify({ groupName: '' }));
        // Second tab: AI returns valid name
        mockPrompt.mockResolvedValueOnce(JSON.stringify({ groupName: 'Valid' }));

        await generateTabGroupSuggestions(
            context,
            () => { },
            () => { }
        );

        // Verify the second prompt did NOT receive the empty string in existingGroupNames
        const secondCallArg = mockPrompt.mock.calls[1][0];
        // We now use Markdown, so we check string inclusion

        // existingGroupNames should only contain 'Valid', not ''
        expect(secondCallArg).toContain('- Valid');
        expect(secondCallArg).not.toContain('- ""'); // Quotes wouldn't be there in markdown typically, but just ensuring empty line isn't added as a bullet

        // More robust check: Split by lines and ensure only one bullet point exists
        const lines = secondCallArg.split('\n');
        const bulletPoints = lines.filter((line: string) => line.trim().startsWith('- '));
        expect(bulletPoints.length).toBe(1);
        expect(bulletPoints[0]).toContain('Valid');
    });
});
