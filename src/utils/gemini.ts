import { GoogleGenAI } from '@google/genai';

export interface ModelInfo {
    id: string;
    displayName: string;
}

export const listAvailableModels = async (apiKey: string): Promise<ModelInfo[]> => {
    if (!apiKey) return [];

    try {
        const client = new GoogleGenAI({ apiKey: apiKey });
        // list() returns a Pager which is an async iterable
        const modelList = await client.models.list();

        const models: ModelInfo[] = [];
        for await (const model of modelList) {
            // Filter for models that support content generation
            if (model.name && model.name.includes('gemini') && model.supportedActions?.includes('generateContent')) {
                const id = model.name.replace('models/', '');
                const displayName = model.displayName || id;

                // Exclude specialized models not suitable for text tasks
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

                // Filter for "latest" (stable) or "preview" models
                const isLatestOrPreview = id.includes('latest') || id.includes('preview');

                if (isLatestOrPreview && !isSpecialized) {
                    models.push({ id, displayName });
                }
            }
        }
        return models;

    } catch (e) {
        console.error("Failed to list Gemini models", e);
        return [];
    }
};

export const generateContentGemini = async (
    apiKey: string,
    modelName: string,
    systemInstruction: string,
    prompt: string
): Promise<string> => {
    const client = new GoogleGenAI({ apiKey: apiKey });

    // Config object for generateContent
    const config = {
        responseMimeType: 'application/json',
        systemInstruction: systemInstruction, // SDK allows simple string here or Content[]
    };

    const response = await client.models.generateContent({
        model: modelName,
        config: config,
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        text: prompt
                    }
                ]
            }
        ]
    });

    if (response.text) {
        return response.text;
    }

    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.text) {
        return candidate.content.parts[0].text;
    }

    throw new Error("No response text from Gemini");
};
