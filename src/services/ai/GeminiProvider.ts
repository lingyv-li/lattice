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
        const isGemma = this.model.includes('gemma');

        const config = isGemma ? {} : {
            responseMimeType: 'application/json',
            systemInstruction: systemPrompt,
        };

        const finalUserPrompt = isGemma
            ? `System Instructions: ${systemPrompt}\n\nIMPORTANT: Output ONLY valid JSON.\n\nUser Request: ${userPrompt}`
            : userPrompt;

        const response = await client.models.generateContent({
            model: this.model,
            config: config,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: finalUserPrompt }]
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
