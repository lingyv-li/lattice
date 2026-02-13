import { BaseProvider } from './BaseProvider';
import { GoogleGenAI } from '@google/genai';
import { AIProviderError, ConfigurationError, AbortError } from '../../utils/AppError';

export class GeminiProvider extends BaseProvider {
    id = 'gemini';

    protected override get includesGroupTabs(): boolean {
        return true;
    }

    constructor(
        private apiKey: string,
        private model: string
    ) {
        super();
    }

    protected async promptAI(userPrompt: string, systemPrompt: string, signal: AbortSignal): Promise<string> {
        if (!this.apiKey) throw new ConfigurationError('API Key is missing for Gemini Cloud.');
        if (!this.model) throw new ConfigurationError('Please select an AI model in Settings.');

        console.log(`[GeminiProvider] [${new Date().toISOString()}] Prompting model: ${this.model}`);

        const client = new GoogleGenAI({ apiKey: this.apiKey });
        const isGemma = this.model.includes('gemma');

        const config = isGemma
            ? {}
            : {
                  responseMimeType: 'application/json',
                  systemInstruction: systemPrompt
              };

        const finalUserPrompt = isGemma ? `System Instructions: ${systemPrompt}\n\nIMPORTANT: Output ONLY valid JSON.\n\nUser Request: ${userPrompt}` : userPrompt;

        console.log(`[GeminiProvider] [${new Date().toISOString()}] Sending request to ${this.model}${isGemma ? ' (Gemma mode)' : ''}`);

        // Fail fast if already aborted before issuing the network request
        if (signal.aborted) throw new AbortError('Request aborted');

        // Handle abort signal manually since Google GenAI SDK doesn't directly support it
        const requestPromise = client.models.generateContent({
            model: this.model,
            config: config,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: finalUserPrompt }]
                }
            ]
        });

        // Race the request against the abort signal.
        // { once: true } ensures the listener is auto-removed after it fires,
        // preventing a memory leak when the request completes before abort.
        const response = await Promise.race([
            requestPromise,
            new Promise<never>((_, reject) => {
                signal.addEventListener('abort', () => reject(new AbortError('Request aborted')), { once: true });
            })
        ]);

        if (response.text) {
            console.log(`[GeminiProvider] [${new Date().toISOString()}] Response received successfully`);
            return response.text;
        }

        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]?.text) {
            console.log(`[GeminiProvider] [${new Date().toISOString()}] Response received from candidate`);
            return candidate.content.parts[0].text;
        }

        console.error(`[GeminiProvider] [${new Date().toISOString()}] No response text from Gemini`);
        throw new AIProviderError('No response text from Gemini');
    }
}
