import { AIProvider, GroupingRequest } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { generateContentGemini } from '../../utils/gemini';
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
                const responseText = await generateContentGemini(this.apiKey, this.model, systemPrompt, userPrompt);
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
}
