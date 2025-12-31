
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalProvider } from '../LocalProvider';
import { GroupingRequest } from '../types';

// Mock specific logic for this test file
const mockPrompt = vi.fn();
const mockCreate = vi.fn();
const mockDestroy = vi.fn();

// Setup global mock for Nano/LanguageModel
// @ts-ignore
global.LanguageModel = {
    create: mockCreate
};

// @ts-ignore
global.self = global;

describe('LocalProvider', () => {
    let provider: LocalProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        LocalProvider.reset();
        provider = new LocalProvider();

        mockCreate.mockResolvedValue({
            prompt: mockPrompt,
            destroy: mockDestroy
        });
    });

    it('should initialize session on first call', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab 1', url: 'http://tab1.com' }]
        };

        mockPrompt.mockResolvedValue(JSON.stringify([
            { tabId: 1, groupName: 'Group 1' }
        ]));

        await provider.generateSuggestions(request, () => { });

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should re-initialize session if customRules change', async () => {
        const requestA: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab', url: 'http://example.com' }],
            customRules: 'Rule A'
        };
        const requestB: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 2, title: 'Tab', url: 'http://example.com' }],
            customRules: 'Rule B'
        };
        mockPrompt.mockResolvedValue(JSON.stringify([
            { tabId: 1, groupName: 'G' }
        ]));

        await provider.generateSuggestions(requestA, () => { });
        await provider.generateSuggestions(requestB, () => { });

        expect(mockDestroy).toHaveBeenCalledTimes(1); // Old session destroyed
        expect(mockCreate).toHaveBeenCalledTimes(2); // New session created
    });

    it('should process all tabs in a single batch prompt', async () => {
        const tabs = [
            { id: 1, title: 'Tab 1', url: 'http://tab1.com' },
            { id: 2, title: 'Tab 2', url: 'http://tab2.com' }
        ];
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: tabs
        };

        mockPrompt.mockResolvedValue(JSON.stringify([
            { tabId: 1, groupName: 'Group A' },
            { tabId: 2, groupName: 'Group A' }
        ]));

        const result = await provider.generateSuggestions(request, () => { });

        // Should call prompt only once (batch mode, both tabs fit in one batch)
        expect(mockPrompt).toHaveBeenCalledTimes(1);
        // Both tabs should be grouped
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].tabIds).toContain(1);
        expect(result.suggestions[0].tabIds).toContain(2);
        expect(result.errors).toHaveLength(0);
    });

    it('should collect error if AI API is not supported', async () => {
        // @ts-ignore
        global.LanguageModel = undefined;
        // @ts-ignore
        global.self.ai = undefined;

        LocalProvider.reset();

        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'T', url: 'U' }]
        };

        const result = await provider.generateSuggestions(request, () => { });

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('AI API not supported');

        // Restore global
        // @ts-ignore
        global.LanguageModel = { create: mockCreate };
    });
});
