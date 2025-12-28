import { GoogleGenAI } from '@google/genai';

export const listAvailableModels = async (apiKey: string): Promise<string[]> => {
    if (!apiKey) return [];

    try {
        const client = new GoogleGenAI({ apiKey: apiKey });
        // list() returns a Pager which is an async iterable
        const modelList = await client.models.list();

        const models: string[] = [];
        for await (const model of modelList) {
            if (model.name && model.name.includes('gemini') && model.supportedActions?.includes('generateContent')) {
                models.push(model.name.replace('models/', ''));
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
