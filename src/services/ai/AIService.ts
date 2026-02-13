import { GoogleGenAI } from '@google/genai';
import { AppSettings, AIProviderType } from '../../utils/storage';
import { AIProvider, ModelInfo } from './types';
import { GeminiProvider } from './GeminiProvider';
import { LocalProvider } from './LocalProvider';
import { ConfigurationError } from '../../utils/AppError';

export class AIService {
    static async getProvider(settings: AppSettings): Promise<AIProvider> {
        switch (settings.aiProvider) {
            case AIProviderType.Gemini:
                return new GeminiProvider(settings.geminiApiKey, settings.aiModel);
            case AIProviderType.Local:
                return new LocalProvider();
            case AIProviderType.None:
                throw new ConfigurationError('AI Provider is disabled.');
            default:
                throw new ConfigurationError('Invalid AI Provider.');
        }
    }

    static async listGeminiModels(apiKey: string): Promise<ModelInfo[]> {
        if (!apiKey) return [];

        const client = new GoogleGenAI({ apiKey: apiKey });
        const modelList = await client.models.list();

        const models: ModelInfo[] = [];
        const modelRegex = /^(models\/)?(gemini|gemma)/;
        const SPECIALIZED_KEYWORDS = ['image', 'audio', 'speech', 'tts', 'robotics', 'computer'];

        for await (const model of modelList) {
            if (model.name && modelRegex.test(model.name) && model.supportedActions?.includes('generateContent')) {
                const id = model.name.replace('models/', '');
                const displayName = model.displayName || id;
                const displayNameLower = displayName.toLowerCase();
                const isSpecialized = SPECIALIZED_KEYWORDS.some(kw => id.includes(kw) || displayNameLower.includes(kw));

                const isLatestOrPreview = id.includes('latest') || id.includes('preview') || id.includes('it');

                if (isLatestOrPreview && !isSpecialized) {
                    models.push({ id, displayName });
                }
            }
        }
        console.log('Found models', models);
        return models;
    }
}
