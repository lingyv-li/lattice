import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../GeminiProvider';
import { GroupingRequest, GroupContext } from '../types';

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
        vi.useFakeTimers();
        const noKeyProvider = new GeminiProvider('', 'gemini-pro');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: new AbortController().signal
        };

        const promise = noKeyProvider.generateSuggestions(request);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('API Key is missing');
        vi.useRealTimers();
    });

    it('should collect error if model is missing', async () => {
        vi.useFakeTimers();
        const noModelProvider = new GeminiProvider('fake-key', '');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: new AbortController().signal
        };

        const promise = noModelProvider.generateSuggestions(request);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].name).toBe('ConfigurationError');
        expect(result.errors[0].message).toBe('Please select an AI model in Settings.');
        vi.useRealTimers();
    });

    it('should correctly handle assignments and group mapping', async () => {
        const tabs = [
            { id: 1, title: 'Shop 1', url: 'http://shop.com/1' },
            { id: 2, title: 'Shop 2', url: 'http://shop.com/2' }
        ];
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: tabs,
            signal: new AbortController().signal
        };

        mockGenerateContent.mockResolvedValue({
            text: JSON.stringify({
                "Shopping": [1, 2]
            })
        });

        const result = await provider.generateSuggestions(request);

        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0].groupName).toBe('Shopping');
        expect(result.suggestions[0].tabIds).toEqual([1, 2]);
        expect(result.suggestions[0].existingGroupId).toBeNull();
        expect(result.errors).toHaveLength(0);
    });

    it('should use existing group ID if AI returns existing name', async () => {
        const existingGroups = new Map<string, GroupContext>();
        existingGroups.set('Work', { id: 100, tabs: [] });

        const tabs = [{ id: 1, title: 'Work Doc', url: 'http://docs.com' }];
        const request: GroupingRequest = {
            existingGroups,
            ungroupedTabs: tabs,
            signal: new AbortController().signal
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
        vi.useFakeTimers();
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: new AbortController().signal
        };

        mockGenerateContent.mockResolvedValue({
            text: "This is not JSON"
        });

        const promise = provider.generateSuggestions(request);

        // Fast-forward through retries
        await vi.runAllTimersAsync();

        const result = await promise;

        expect(result.suggestions).toEqual([]);
        // Malformed JSON should now be caught and returned as an error
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toMatch(/JSON5|invalid|Unexpected/i);
        vi.useRealTimers();
    });

    it('should collect error on empty response text', async () => {
        vi.useFakeTimers();
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: new AbortController().signal
        };

        mockGenerateContent.mockResolvedValue({}); // No text

        const promise = provider.generateSuggestions(request);
        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toContain('No response text');
        vi.useRealTimers();
    });

    it('should handle Gemma models differently (no system instruction in config)', async () => {
        const gemmaProvider = new GeminiProvider('fake-key', 'gemma-2-9b-it');
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: new AbortController().signal
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
        expect(promptText).toContain('Output ONLY valid JSON');
        expect(promptText).toContain('IMPORTANT: Output ONLY valid JSON');
    });

    describe('Prompt Construction Context', () => {
        // Expose protected method for testing
        class TestGeminiProvider extends GeminiProvider {
            public testConstructExistingGroupsPrompt(
                groups: Map<string, GroupContext>
            ): string {
                return this.constructExistingGroupsPrompt(groups);
            }
        }

        it('should construct prompt with existing group tabs and sampled content', () => {
            const provider = new TestGeminiProvider('fake-key', 'gemini-pro');
            const groups = new Map<string, GroupContext>();
            groups.set("Work", {
                id: 1,
                tabs: [
                    { id: 101, title: "GitHub", url: "https://github.com" },
                    { id: 102, title: "Jira", url: "https://jira.com" }
                ]
            });
            groups.set("Social", { id: 2, tabs: [] });

            const prompt = provider.testConstructExistingGroupsPrompt(groups);

            expect(prompt).toBe(`<existing_groups>
- "Work"
  - [GitHub](https://github.com/)
  - [Jira](https://jira.com/)
- "Social"
</existing_groups>`);
        });

        it('should handle empty group tabs gracefully', () => {
            const provider = new TestGeminiProvider('fake-key', 'gemini-pro');
            const groups = new Map<string, GroupContext>();
            groups.set("Work", { id: 1, tabs: [] });

            const prompt = provider.testConstructExistingGroupsPrompt(groups);

            expect(prompt).toBe(`<existing_groups>
- "Work"
</existing_groups>`);
        });
    });

    it('should abort inflight request when signal is triggered', async () => {
        const controller = new AbortController();
        const request: GroupingRequest = {
            existingGroups: new Map(),
            ungroupedTabs: [{ id: 1, title: 'Test', url: 'http://test.com' }],
            signal: controller.signal
        };

        // Mock a long running request
        mockGenerateContent.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { text: "Should not be returned" };
        });

        const promise = provider.generateSuggestions(request);

        // Abort immediately
        controller.abort();

        const result = await promise;

        expect(result.suggestions).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].name).toBe('AbortError');
    });
});
