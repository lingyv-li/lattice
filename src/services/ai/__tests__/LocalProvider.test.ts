
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
        provider = new LocalProvider('No gaming sites');

        mockCreate.mockResolvedValue({
            prompt: mockPrompt,
            destroy: mockDestroy
        });
    });

    afterEach(() => {
        // We need to clear the static cache method in LocalProvider if we want fresh state,
        // but it's private. We can rely on ensuring cachedRules matches or is different to trigger reset.
    });

    it('should initialize session on first call', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab 1', url: 'http://tab1.com' }]
        };

        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'Group 1' }));

        await provider.generateSuggestions(request, () => { });

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should re-initialize session if rules change', async () => {
        // First provider with Rule A
        const providerA = new LocalProvider('Rule A');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab', url: '...' }]
        };
        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'G' }));

        await providerA.generateSuggestions(request, () => { });

        // Second provider with Rule B
        const providerB = new LocalProvider('Rule B');
        await providerB.generateSuggestions(request, () => { });

        expect(mockDestroy).toHaveBeenCalledTimes(1); // Old session destroyed
        expect(mockCreate).toHaveBeenCalledTimes(2); // New session created
    });

    it('should process tabs sequentially (one by one)', async () => {
        const tabs = [
            { id: 1, title: 'Tab 1', url: '...' },
            { id: 2, title: 'Tab 2', url: '...' }
        ];
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: tabs
        };

        mockPrompt.mockResolvedValue(JSON.stringify({ groupName: 'Group' }));

        await provider.generateSuggestions(request, () => { });

        expect(mockPrompt).toHaveBeenCalledTimes(2);
    });

    it('should throw error if AI API is not supported', async () => {
        // @ts-ignore
        global.LanguageModel = undefined;
        // @ts-ignore
        global.window = {}; // Ensure window.ai is also missing


        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'T', url: 'U' }]
        };

        // We need to force a reset of the static cache or use a fresh environment. 
        // Since we can't easily access the private static cache, this test relies on
        // the fact that previous tests might have set it. 
        // This makes testing the static singleton tricky in shared capability mode.
        // For now, let's assume we can trigger a re-init by changing rules, which calls ensureLocalSession

        // However, if the API is missing, ensuring session will fail.

        // Let's try to verify failure by creating a new provider with new rules
        const providerNew = new LocalProvider("New Rules Force Init");

        await expect(providerNew.generateSuggestions(request, () => { }))
            .rejects.toThrow("AI API not supported");

        // Restore global
        // @ts-ignore
        global.LanguageModel = { create: mockCreate };
    });
});
