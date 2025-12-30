
import { describe, it, expect } from 'vitest';
import { AIService } from '../AIService';
import { GeminiProvider } from '../GeminiProvider';
import { LocalProvider } from '../LocalProvider';
import { AppSettings } from '../../../utils/storage';

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

    it('should return LocalProvider as default (if something else specified, though types restrict)', async () => {
        // @ts-ignore
        const settings = {
            aiProvider: 'unknown'
        } as AppSettings;

        const provider = await AIService.getProvider(settings);
        expect(provider).toBeInstanceOf(LocalProvider);
    });
});
