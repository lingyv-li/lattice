import { GoogleGenAI } from '@google/genai';
import { AppSettings, AIProviderType } from '../../utils/storage';
import { AIProvider, ModelInfo } from './types';
import { GeminiProvider } from './GeminiProvider';
import { LocalProvider } from './LocalProvider';

export class AIService {
    static async getProvider(settings: AppSettings): Promise<AIProvider> {
        switch (settings.aiProvider) {
            case AIProviderType.Gemini:
                return new GeminiProvider(settings.geminiApiKey, settings.aiModel);
            case AIProviderType.Local:
                return new LocalProvider();
            case AIProviderType.None:
                throw new Error("AI Provider is disabled.");
            default:
                throw new Error("Invalid AI Provider.");
        }
    }

    static async listGeminiModels(apiKey: string): Promise<ModelInfo[]> {
        if (!apiKey) return [];

        try {
            const client = new GoogleGenAI({ apiKey: apiKey });
            const modelList = await client.models.list();

            const models: ModelInfo[] = [];
            const modelRegex = /^(models\/)?(gemini|gemma)/;

            for await (const model of modelList) {
                if (model.name && modelRegex.test(model.name) && model.supportedActions?.includes('generateContent')) {
                    const id = model.name.replace('models/', '');
                    const displayName = model.displayName || id;

                    const isSpecialized =
                        id.includes('image') ||
                        id.includes('audio') ||
                        id.includes('speech') ||
                        id.includes('tts') ||
                        id.includes('robotics') ||
                        id.includes('computer') ||
                        displayName.toLowerCase().includes('image') ||
                        displayName.toLowerCase().includes('audio') ||
                        displayName.toLowerCase().includes('tts') ||
                        displayName.toLowerCase().includes('robotics') ||
                        displayName.toLowerCase().includes('computer');

                    const isLatestOrPreview = id.includes('latest') || id.includes('preview') || id.includes('it');

                    if (isLatestOrPreview && !isSpecialized) {
                        models.push({ id, displayName });
                    }
                }
            }
            console.log("Found models", models);
            return models;

        } catch (e) {
            console.error("Failed to list Gemini models", e);
            return [];
        }
    }
}
