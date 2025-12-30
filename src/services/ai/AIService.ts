
import { AppSettings } from '../../utils/storage';
import { AIProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { LocalProvider } from './LocalProvider';

export class AIService {
    static async getProvider(settings: AppSettings): Promise<AIProvider> {
        if (settings.aiProvider === 'gemini') {
            return new GeminiProvider(settings.geminiApiKey, settings.aiModel);
        } else {
            return new LocalProvider(settings.customGroupingRules);
        }
    }
}
