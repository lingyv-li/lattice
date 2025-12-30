import { BaseProvider } from './BaseProvider';
import { GoogleGenAI } from '@google/genai';

export class GeminiProvider extends BaseProvider {
    id = 'gemini';

    constructor(
        private apiKey: string,
        private model: string
    ) {
        super();
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string
    ): Promise<string> {
        if (!this.apiKey) throw new Error("API Key is missing for Gemini Cloud.");

        const client = new GoogleGenAI({ apiKey: this.apiKey });

        const config = {
            responseMimeType: 'application/json',
            systemInstruction: systemPrompt,
        };

        const response = await client.models.generateContent({
            model: this.model,
            config: config,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userPrompt }]
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
    }
}
