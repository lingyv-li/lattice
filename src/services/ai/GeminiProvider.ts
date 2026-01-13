import { BaseProvider } from './BaseProvider';
import { GroupContext } from './types';
import { GoogleGenAI } from '@google/genai';
import { AIProviderError, ConfigurationError, AbortError } from '../../utils/AppError';
import { sanitizeUrl } from './sanitization';

export class GeminiProvider extends BaseProvider {
    id = 'gemini';

    constructor(
        private apiKey: string,
        private model: string
    ) {
        super();
    }

    protected constructExistingGroupsPrompt(
        groups: Map<string, GroupContext>
    ): string {
        const currentGroups = Array.from(groups.keys()).filter(name => name.trim().length > 0);
        if (currentGroups.length === 0) return "";

        let prompt = "<existing_groups>\n";
        for (const name of currentGroups) {
            prompt += `- "${name}"`;
            const context = groups.get(name);
            if (context && context.tabs.length > 0) {
                // Use nested list for clearer structure
                prompt += "\n" + context.tabs.map(t => `  - [${t.title}](${sanitizeUrl(t.url)})`).join('\n');
            }
            prompt += "\n";
        }
        prompt += "</existing_groups>";
        return prompt;
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string,
        signal?: AbortSignal
    ): Promise<string> {
        if (!this.apiKey) throw new ConfigurationError("API Key is missing for Gemini Cloud.");
        if (!this.model) throw new ConfigurationError("Please select an AI model in Settings.");

        console.log(`[GeminiProvider] [${new Date().toISOString()}] Prompting model: ${this.model}`);

        const client = new GoogleGenAI({ apiKey: this.apiKey });
        const isGemma = this.model.includes('gemma');

        const config = isGemma ? {} : {
            responseMimeType: 'application/json',
            systemInstruction: systemPrompt,
        };

        const finalUserPrompt = isGemma
            ? `System Instructions: ${systemPrompt}\n\nIMPORTANT: Output ONLY valid JSON.\n\nUser Request: ${userPrompt}`
            : userPrompt;

        console.log(`[GeminiProvider] [${new Date().toISOString()}] Sending request to ${this.model}${isGemma ? ' (Gemma mode)' : ''}`);

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

        // Race the request against the abort signal
        const response = signal
            ? await Promise.race([
                requestPromise,
                new Promise<never>((_, reject) => {
                    if (signal.aborted) {
                        reject(new AbortError('Request aborted'));
                    }
                    signal.addEventListener('abort', () => {
                        reject(new AbortError('Request aborted'));
                    });
                })
            ])
            : await requestPromise;

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
        throw new AIProviderError("No response text from Gemini");
    }
}
