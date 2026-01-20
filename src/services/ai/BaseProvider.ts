import { AIProvider, GroupingRequest, SuggestionResult, GroupContext } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { handleAssignment, cleanAndParseJson, constructSystemPrompt } from './shared';
import { sanitizeUrl } from './sanitization';

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
        signal: AbortSignal
    ): Promise<string>;

    protected getSystemPrompt(customRules?: string): string {
        return constructSystemPrompt(customRules);
    }

    protected constructExistingGroupsPrompt(
        groups: Map<string, GroupContext>
    ): string {
        const sortedGroups = Array.from(groups.entries())
            .filter(([name]) => name.trim().length > 0)
            // Sort by recency (newest first)
            .sort(([, a], [, b]) => (b.lastActive || 0) - (a.lastActive || 0));

        if (sortedGroups.length === 0) return "";

        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();

        const groupLines = sortedGroups.map(([name, context]) => {
            let label = "";
            if (context.lastActive) {
                const diff = now - context.lastActive;
                if (diff > 7 * ONE_DAY_MS) {
                    label = ` (Inactive ${Math.floor(diff / ONE_DAY_MS)}d)`;
                } else if (diff > ONE_DAY_MS) {
                    label = ` (Active ${Math.floor(diff / ONE_DAY_MS)}d ago)`;
                } else {
                    label = ` (Active today)`;
                }
            }
            return `- "${name}"${label}`;
        });

        return "<existing_groups>\n" + groupLines.join('\n') + "\n</existing_groups>";
    }

    async generateSuggestions(
        request: GroupingRequest
    ): Promise<SuggestionResult> {
        const { ungroupedTabs, existingGroups, customRules, signal } = request;
        const groupNameMap = new Map<string, number>();
        for (const [name, context] of existingGroups) {
            groupNameMap.set(name, context.id);
        }
        const suggestions = new Map<string, TabGroupSuggestion>();
        const errors: Error[] = [];
        let nextNewGroupId = -1;

        const startTime = Date.now();
        console.log(`[${this.id}] [${new Date().toISOString()}] Generating suggestions for ${ungroupedTabs.length} tabs`);

        const systemPrompt = this.getSystemPrompt(customRules);

        const tabList = ungroupedTabs
            .map(t => `- [ID: ${t.id}] [${t.title}](${sanitizeUrl(t.url)})`)
            .join('\n');

        const existingGroupsPrompt = this.constructExistingGroupsPrompt(existingGroups);

        const userPrompt = (
            existingGroupsPrompt.length > 0 ? existingGroupsPrompt + "\n" : "")
            + `\n<ungrouped_tabs>\n${tabList}\n</ungrouped_tabs>`;

        const MAX_RETRIES = 3;
        const BASE_DELAY = 1000;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const responseText = await this.promptAI(userPrompt, systemPrompt, signal);
                console.log(`[${this.id}] [${new Date().toISOString()}] Parsing AI response (Attempt ${attempt}/${MAX_RETRIES})`);
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
                } else if (typeof parsed === 'object' && parsed !== null) {
                    // Dictionary format: { "Group Name": [1, 2, 3] }
                    for (const [groupName, tabIds] of Object.entries(parsed)) {
                        if (Array.isArray(tabIds)) {
                            for (const tabId of tabIds) {
                                // Verify tabId exists in the requested tabs
                                // weak comparison for safety (json might map numbers as strings sometimes? unlikely but safe)
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

                // If we got here, success! Break the retry loop.
                break;

            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));

                // Don't retry if aborted
                // check for 'AbortError' name or message includes 'aborted'
                if (error.name === 'AbortError' || error.message.includes('aborted')) {
                    console.log(`[${this.id}] Request aborted, stopping retries.`);
                    errors.push(error);
                    break;
                }

                console.warn(`[${this.id}] Attempt ${attempt} failed:`, error.message);

                if (attempt === MAX_RETRIES) {
                    console.error(`[${this.id}] All ${MAX_RETRIES} attempts failed. Giving up.`);
                    errors.push(error);
                } else {
                    // Exponential backoff: 1s, 2s, 4s...
                    const delay = BASE_DELAY * Math.pow(2, attempt - 1);
                    console.log(`[${this.id}] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[${this.id}] [${new Date().toISOString()}] Generated ${suggestions.size} suggestions with ${errors.length} errors (took ${duration}ms)`);

        return {
            suggestions: Array.from(suggestions.values()),
            errors
        };
    }
}
