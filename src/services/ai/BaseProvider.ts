import { AIProvider, GroupingRequest, SuggestionResult } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { handleAssignment, cleanAndParseJson, constructSystemPrompt } from './shared';

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
        request: GroupingRequest
    ): Promise<SuggestionResult> {
        const { ungroupedTabs, existingGroups, customRules } = request;
        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();
        const errors: Error[] = [];
        let nextNewGroupId = -1;

        const systemPrompt = constructSystemPrompt(customRules);

        const currentGroupNames = Array.from(groupNameMap.keys())
            .filter(name => name.trim().length > 0);
        const tabList = ungroupedTabs
            .map(t => `- [ID: ${t.id}] Title: ${t.title}, URL: ${t.url}`)
            .join('\n');

        const userPrompt = (
            currentGroupNames.length > 0 ?
                "Existing Groups:\n" + currentGroupNames.map(name => `- ${name}`).join('\n') : "")
            + `\nUngrouped Tabs:\n${tabList}`;

        try {
            const responseText = await this.promptAI(userPrompt, systemPrompt, customRules);
            const parsed = cleanAndParseJson(responseText);

            if (Array.isArray(parsed)) {
                for (const assignment of parsed) {
                    const { tabId, groupName } = assignment;
                    // Verify tabId exists in the requested tabs
                    if (!ungroupedTabs.find(t => t.id === tabId)) continue;

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
            console.error(`[${this.id}] Prompt failed`, error);
            errors.push(error);
        }

        return {
            suggestions: Array.from(suggestions.values()),
            errors
        };
    }
}
