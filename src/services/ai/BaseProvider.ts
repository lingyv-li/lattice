import { AIProvider, GroupingRequest, SuggestionResult } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { handleAssignment, cleanAndParseJson, constructSystemPrompt } from './shared';

const BATCH_SIZE = 10;

/**
 * Abstract base class for AI providers with shared batch processing logic.
 */
export abstract class BaseProvider implements AIProvider {
    abstract id: string;

    /**
     * Provider-specific method to call the AI with a prompt.
     * @param userPrompt The user prompt with tabs to analyze
     * @param systemPrompt The system prompt with instructions
     * @param customRules Optional custom grouping rules
     */
    protected abstract promptAI(
        userPrompt: string,
        systemPrompt: string,
        customRules?: string
    ): Promise<string>;

    async generateSuggestions(
        request: GroupingRequest,
        onProgress: (progress: number) => void
    ): Promise<SuggestionResult> {
        const { ungroupedTabs, existingGroups, customRules } = request;
        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();
        const errors: Error[] = [];
        let nextNewGroupId = -1;

        const totalTabs = ungroupedTabs.length;
        const batches = [];
        for (let i = 0; i < totalTabs; i += BATCH_SIZE) {
            batches.push(ungroupedTabs.slice(i, i + BATCH_SIZE));
        }

        let processedCount = 0;
        const systemPrompt = constructSystemPrompt(customRules, true);

        for (const batch of batches) {
            const currentGroupNames = Array.from(groupNameMap.keys())
                .filter(name => name.trim().length > 0);
            const tabList = batch
                .map(t => `- [ID: ${t.id}] Title: ${t.title}, URL: ${t.url}`)
                .join('\n');

            const userPrompt = `
Existing Groups:
${currentGroupNames.map(name => `- ${name}`).join('\n')}

Ungrouped Tabs:
${tabList}
            `.trim();

            try {
                const responseText = await this.promptAI(userPrompt, systemPrompt, customRules);
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
                const error = err instanceof Error ? err : new Error(String(err));
                console.error(`[${this.id}] Batch prompt failed`, error);
                errors.push(error);
            }

            processedCount += batch.length;
            onProgress(Math.round((processedCount / totalTabs) * 100));
        }

        return {
            suggestions: Array.from(suggestions.values()),
            errors
        };
    }
}
