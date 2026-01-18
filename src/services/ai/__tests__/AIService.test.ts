
import { describe, it, expect, vi } from 'vitest';
import { AIService } from '../AIService';
import { GeminiProvider } from '../GeminiProvider';
import { LocalProvider } from '../LocalProvider';
import { AppSettings } from '../../../utils/storage';

// Mock @google/genai for listGeminiModels
const mockList = vi.fn();
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class {
            models = {
                list: mockList
            };
        }
    };
});

describe('AIService', () => {
    it('should return GeminiProvider when aiProvider is gemini', async () => {
        const settings = {
            aiProvider: 'gemini',
            geminiApiKey: 'test-key',
            aiModel: 'gemini-pro',
            customGroupingRules: ''
        } as AppSettings;

        const provider = await AIService.getProvider(settings);
        expect(provider).toBeInstanceOf(GeminiProvider);
        expect(provider.id).toBe('gemini');
    });

    it('should return LocalProvider when aiProvider is local', async () => {
        const settings = {
            aiProvider: 'local',
            customGroupingRules: 'no rules'
        } as AppSettings;

        const provider = await AIService.getProvider(settings);
        expect(provider).toBeInstanceOf(LocalProvider);
        expect(provider.id).toBe('local');
    });

    describe('listGeminiModels', () => {
        it('should return empty list if api key is missing', async () => {
            const models = await AIService.listGeminiModels('');
            expect(models).toEqual([]);
        });

        it('should list and filter models correctly', async () => {
            mockList.mockResolvedValue([
                { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedActions: ['generateContent'] },
                { name: 'models/gemini-ultra-preview', displayName: 'Gemini Ultra Preview', supportedActions: ['generateContent'] },
                { name: 'models/embedding-001', displayName: 'Embedding', supportedActions: ['embedContent'] }, // Wrong action
                { name: 'models/gemini-vision', displayName: 'Gemini Vision', supportedActions: ['generateContent'] }, // Specialized (image)
            ]);

            await AIService.listGeminiModels('key');

            // Expected: Gemin Pro (latest/stable implicitly? No, logic filters for "latest" OR "preview" in ID)
            // Wait, logic says: id.includes('latest') || id.includes('preview')
            // 'gemini-pro' does NOT include latest or preview. 
            // 'gemini-1.5-flash-latest' does.
            // Let's adjust mock to match real world or logic expectation.

            // Re-checking logic in AIService.ts:
            // const isLatestOrPreview = id.includes('latest') || id.includes('preview');
            // if (isLatestOrPreview && !isSpecialized) { ... }

            // So 'gemini-pro' would be skipped? That seems strict if true.
            // Let's assume standard models have version numbers usually.

            mockList.mockResolvedValue([
                { name: 'models/gemini-1.5-pro-latest', displayName: 'Gemini 1.5 Pro', supportedActions: ['generateContent'] },
                { name: 'models/gemini-1.0-pro', displayName: 'Gemini 1.0 Pro', supportedActions: ['generateContent'] }, // Skipped
                { name: 'models/text-embedding-004', displayName: 'Embedding', supportedActions: ['embedContent'] },
            ]);

            const result = await AIService.listGeminiModels('key');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('gemini-1.5-pro-latest');
        });

        it('should propagate API errors', async () => {
            mockList.mockRejectedValue(new Error("API Error"));
            await expect(AIService.listGeminiModels('key')).rejects.toThrow("API Error");
        });
    });
});
