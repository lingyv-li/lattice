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
     * @param signal Optional AbortSignal for cancellation
     */
    protected abstract promptAI(
        userPrompt: string,
        systemPrompt: string,
        signal?: AbortSignal
    ): Promise<string>;

    protected getSystemPrompt(customRules?: string): string {
        return constructSystemPrompt(customRules);
    }

    async generateSuggestions(
        request: GroupingRequest
    ): Promise<SuggestionResult> {
        const { ungroupedTabs, existingGroups, customRules, signal } = request;
        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();
        const errors: Error[] = [];
        let nextNewGroupId = -1;

        const startTime = Date.now();
        console.log(`[${this.id}] [${new Date().toISOString()}] Generating suggestions for ${ungroupedTabs.length} tabs`);

        const systemPrompt = this.getSystemPrompt(customRules);

        const currentGroupNames = Array.from(groupNameMap.keys())
            .filter(name => name.trim().length > 0);
        const tabList = ungroupedTabs
            .map(t => `- [ID: ${t.id}] Title: "${t.title}", URL: "${t.url}"`)
            .join('\n');

        const userPrompt = (
            currentGroupNames.length > 0 ?
                "Existing Groups:\n" + currentGroupNames.map(name => `- "${name}"`).join('\n') : "")
            + `\nUngrouped Tabs:\n${tabList}`;

        try {
            const responseText = await this.promptAI(userPrompt, systemPrompt, signal);
            console.log(`[${this.id}] [${new Date().toISOString()}] Parsing AI response`);
            const parsed = cleanAndParseJson(responseText);

            if (Array.isArray(parsed)) {
                // Handle legacy array format: [{ tabId, groupName }]
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
            } else if (typeof parsed === 'object' && parsed !== null) {
                // Handle object formats

                // 1. New Format: { groups: [{ name: "...", ids: [...] }] }
                if ('groups' in parsed && Array.isArray((parsed as any).groups)) {
                    const groups = (parsed as any).groups;
                    for (const group of groups) {
                        const groupName = group.name;
                        // Supports both "ids" (Local) and "tab_ids" (Cloud/Legacy)
                        const tabIds = group.ids || group.tab_ids;

                        if (Array.isArray(tabIds)) {
                            for (const tabId of tabIds) {
                                // Verify tabId exists
                                if (!ungroupedTabs.find(t => t.id == tabId)) continue;

                                nextNewGroupId = handleAssignment(
                                    groupName,
                                    Number(tabId),
                                    groupNameMap,
                                    suggestions,
                                    nextNewGroupId
                                );
                            }
                        }
                    }
                }
                // 2. Legacy Dictionary Format: { "Group Name": [1, 2, 3] }
                else {
                    for (const [groupName, tabIds] of Object.entries(parsed)) {
                        if (groupName === 'reasoning') continue; // Skip metadata

                        if (Array.isArray(tabIds)) {
                            for (const tabId of tabIds) {
                                // Verify tabId exists
                                if (!ungroupedTabs.find(t => t.id == tabId)) continue;

                                nextNewGroupId = handleAssignment(
                                    groupName,
                                    Number(tabId),
                                    groupNameMap,
                                    suggestions,
                                    nextNewGroupId
                                );
                            }
                        }
                    }
                }
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[${this.id}] [${new Date().toISOString()}] Prompt failed`, error);
            errors.push(error);
        }

        const duration = Date.now() - startTime;
        console.log(`[${this.id}] [${new Date().toISOString()}] Generated ${suggestions.size} suggestions with ${errors.length} errors (took ${duration}ms)`);

        return {
            suggestions: Array.from(suggestions.values()),
            errors
        };
    }
}
