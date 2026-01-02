
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalProvider } from '../LocalProvider';
import { GroupingRequest } from '../types';

// Mock specific logic for this test file
const mockPrompt = vi.fn();
const mockCreate = vi.fn();
const mockDestroy = vi.fn();
const mockClone = vi.fn();
const mockAvailability = vi.fn();

// Helper to simulate simple prompt response
function mockPromptResponse(text: string) {
    mockPrompt.mockResolvedValue(text);
}

describe('LocalProvider', () => {
    let provider: LocalProvider;

    beforeEach(() => {
        LocalProvider.reset();
        vi.clearAllMocks();
        provider = new LocalProvider();

        const mockLanguageModel = {
            create: mockCreate,
            availability: mockAvailability
        };

        // Use proper Vitest stubbing for Global
        vi.stubGlobal('LanguageModel', mockLanguageModel);

        mockCreate.mockResolvedValue({
            // Base session needs simple prompt support if used? 
            // Actually getSession uses cachedSession.clone(), only clone needs promptStreaming.
            // But ensureBaseSession creates base session. Does it call prompt? No.
            destroy: mockDestroy,
            clone: mockClone
        });

        // Default availability - User code expects 'available'
        mockAvailability.mockResolvedValue('available');

        // Mock clone to return a new session-like object with streaming support
        mockClone.mockResolvedValue({
            prompt: mockPrompt,
            destroy: mockDestroy
        });
    });

    describe('checkAvailability', () => {
        it('should return "unavailable" if AI API is not present', async () => {
            vi.stubGlobal('LanguageModel', undefined);
            const result = await LocalProvider.checkAvailability();
            expect(result).toBe('unavailable');
        });

        it('should return availability status from API', async () => {
            // Mock returning a string directly
            mockAvailability.mockResolvedValue('after-download');
            const result = await LocalProvider.checkAvailability();
            expect(result).toBe('after-download');
        });

        it('should return "unavailable" if availability check throws', async () => {
            mockAvailability.mockRejectedValue(new Error("Fail"));
            const result = await LocalProvider.checkAvailability();
            expect(result).toBe('unavailable');
        });
    });

    it('should initialize session on first call', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab 1', url: 'http://tab1.com' }]
        };

        const responseText = `Here is some reasoning about the tabs...
@@JSON_START@@
${JSON.stringify([{ tabId: 1, groupName: 'Group 1' }])}`;

        mockPromptResponse(responseText);

        await provider.generateSuggestions(request);

        expect(mockCreate).toHaveBeenCalledTimes(1); // One base session created
        expect(mockClone).toHaveBeenCalledTimes(1); // One clone created for request
        expect(mockPrompt).toHaveBeenCalledTimes(1); // Single-turn CoT prompt
        expect(mockDestroy).toHaveBeenCalledTimes(1); // Clone destroyed after use
    });

    it('should reuse cached session if prompts match', async () => {
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Tab', url: 'http://example.com' }]
        };
        const responseText = `Reasoning...
@@JSON_START@@
${JSON.stringify([{ tabId: 1, groupName: 'G' }])}`;

        mockPromptResponse(responseText);

        // First call
        await provider.generateSuggestions(request);
        // Second call
        await provider.generateSuggestions(request);

        expect(mockCreate).toHaveBeenCalledTimes(1); // Created only once
        expect(mockClone).toHaveBeenCalledTimes(2); // Cloned twice (once per request)
        expect(mockDestroy).toHaveBeenCalledTimes(2); // Clones destroyed twice
        expect(mockPrompt).toHaveBeenCalledTimes(2); // 1 prompt per request
    });

    it('should re-initialize session if rules change', async () => {
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
        const responseText = `Reasoning...
@@JSON_START@@
${JSON.stringify([{ tabId: 1, groupName: 'G' }])}`;
        mockPromptResponse(responseText);

        // Call A
        await provider.generateSuggestions(requestA);
        // Call B
        await provider.generateSuggestions(requestB);

        // Call A: Create(1) -> Clone(1) -> Destroy(1)
        // Call B: Destroy Base A -> Create(2) -> Clone(2) -> Destroy(2)

        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(mockClone).toHaveBeenCalledTimes(2);
        expect(mockDestroy).toHaveBeenCalledTimes(3); // Clone A + Base A + Clone B
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

        const responseText = `Reasoning about Tab 1 and Tab 2...
@@JSON_START@@
${JSON.stringify({ "Group A": [1, 2] })}`;

        mockPromptResponse(responseText);

        const result = await provider.generateSuggestions(request);

        // 1 prompt per request (Merged CoT)
        expect(mockPrompt).toHaveBeenCalledTimes(1);
        // Both tabs should be grouped
        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].tabIds).toContain(1);
        expect(result.suggestions[0].tabIds).toContain(2);
        expect(result.errors).toHaveLength(0);
    });

    it('should collect error if AI API is not supported', async () => {
        vi.stubGlobal('LanguageModel', undefined);

        LocalProvider.reset();

        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'T', url: 'U' }]
        };

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('Local AI is not available.');
    });

    it('should initialize download model with monitoring', async () => {
        await LocalProvider.downloadModel(() => { });

        expect(mockCreate).toHaveBeenCalledTimes(1);
        const createArgs = mockCreate.mock.calls[0][0];
        expect(createArgs).toHaveProperty('monitor');
        expect(createArgs.initialPrompts).toBeUndefined(); // ensureBaseSession shouldn't be called
        expect(mockDestroy).toHaveBeenCalledTimes(1); // destroy called immediately after download check
    });
});
