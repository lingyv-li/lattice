import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseProvider } from './BaseProvider';
import { constructSystemPrompt } from './shared';
import { SettingsStorage } from '../../utils/storage';
import { AIProviderError } from '../../utils/AppError';

export class GeminiProvider extends BaseProvider {
    id = 'gemini';

    protected getSystemPrompt(customRules?: string): string {
        return constructSystemPrompt(customRules, 'cloud');
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string,
        signal?: AbortSignal
    ): Promise<string> {
        const apiKey = await SettingsStorage.getApiKey();
        if (!apiKey) {
            throw new AIProviderError("No Gemini API key found. Please set one in options.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemPrompt,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }]
        });

        const response = result.response;
        return response.text();
    }
}
