import { AIProvider, GroupingRequest } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { GoogleGenAI } from '@google/genai';
import { handleAssignment, cleanAndParseJson, constructSystemPrompt } from './shared';

export class GeminiProvider implements AIProvider {
    id = 'gemini';

    constructor(
        private apiKey: string,
        private model: string
    ) { }

    async generateSuggestions(
        request: GroupingRequest,
        onProgress: (progress: number) => void
    ): Promise<TabGroupSuggestion[]> {
        if (!this.apiKey) throw new Error("API Key is missing for Gemini Cloud.");

        const { ungroupedTabs, existingGroups, customRules } = request;
        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();

        let nextNewGroupId = -1;

        // Logic lifted from utils/ai.ts -> processWithGemini
        const totalTabs = ungroupedTabs.length;
        const BATCH_SIZE = 10;
        const batches = [];
        for (let i = 0; i < totalTabs; i += BATCH_SIZE) {
            batches.push(ungroupedTabs.slice(i, i + BATCH_SIZE));
        }

        let processedCount = 0;

        for (const batch of batches) {
            const currentGroupNames = Array.from(groupNameMap.keys()).filter(name => name.trim().length > 0);
            const tabList = batch.map(t => `- [ID: ${t.id}] Title: ${t.title}, URL: ${t.url}`).join('\n');

            const systemPrompt = constructSystemPrompt(customRules, true);

            const userPrompt = `
    Existing Groups:
    ${currentGroupNames.map(name => `- ${name}`).join('\n')}
    
    Ungrouped Tabs:
    ${tabList}
            `.trim();

            try {
                const responseText = await this.generateContent(this.apiKey, this.model, systemPrompt, userPrompt);
                const parsed = cleanAndParseJson(responseText);

                if (parsed.assignments && Array.isArray(parsed.assignments)) {
                    for (const assignment of parsed.assignments) {
                        const { tabId, groupName } = assignment;
                        if (!batch.find(t => t.id === tabId)) continue;

                        nextNewGroupId = handleAssignment(
                            groupName,
                            tabId,
                            groupNameMap,
                            suggestions,
                            nextNewGroupId
                        );
                    }
                }
            } catch (err) {
                console.error("Batch prompt failed", err);
            }

            processedCount += batch.length;
            onProgress(Math.round((processedCount / totalTabs) * 100));
        }

        return Array.from(suggestions.values());
    }

    private async generateContent(
        apiKey: string,
        modelName: string,
        systemInstruction: string,
        prompt: string
    ): Promise<string> {
        const client = new GoogleGenAI({ apiKey: apiKey });

        // Config object for generateContent
        const config = {
            responseMimeType: 'application/json',
            systemInstruction: systemInstruction,
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
    }
}
