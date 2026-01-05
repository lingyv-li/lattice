import { BaseProvider } from './BaseProvider';
import { constructSystemPrompt, cleanAndParseJson, handleAssignment } from './shared';
import { AIProviderError } from '../../utils/AppError';
import { GroupingRequest, SuggestionResult } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';

export class LocalProvider extends BaseProvider {
    id = 'local';

    private static cachedSession: LanguageModel | null = null;
    private static cachedSystemPrompt: string | null = null;

    // For testing purposes only
    static reset() {
        if (LocalProvider.cachedSession) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }
        LocalProvider.cachedSystemPrompt = null;
    }


    public static async checkAvailability(): Promise<Availability> {
        if (typeof LanguageModel === 'undefined') {
            return 'unavailable';
        }
        try {
            const status = await LanguageModel.availability();
            return status;
        } catch (e) {
            console.error("Failed to check AI availability", e);
            return 'unavailable';
        }
    }

    protected getSystemPrompt(customRules?: string): string {
        return constructSystemPrompt(customRules, 'local');
    }

    private async getSession(systemPrompt: string, signal?: AbortSignal): Promise<LanguageModel> {
        if (LocalProvider.cachedSession && LocalProvider.cachedSystemPrompt === systemPrompt) {
            const cloneStart = Date.now();
            const session = await LocalProvider.cachedSession.clone();
            console.log(`[LocalProvider] Cloned session (took ${Date.now() - cloneStart}ms)`);
            return session;
        }

        if (LocalProvider.cachedSession) {
            console.log(`[LocalProvider] [${new Date().toISOString()}] System prompt changed, destroying stale session`);
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        console.log(`[LocalProvider] [${new Date().toISOString()}] Creating new base session`);
        const sessionCreateStart = Date.now();
        LocalProvider.cachedSession = await LanguageModel.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            initialPrompts: [{
                role: "system",
                content: systemPrompt
            }],
            signal
        });
        const sessionCreateDuration = Date.now() - sessionCreateStart;
        console.log(`[LocalProvider] Base session ready (took ${sessionCreateDuration}ms)`);
        LocalProvider.cachedSystemPrompt = systemPrompt;

        const cloneStart = Date.now();
        const session = await LocalProvider.cachedSession.clone();
        console.log(`[LocalProvider] Cloned initial session (took ${Date.now() - cloneStart}ms)`);
        return session;
    }

    protected async promptAI(
        userPrompt: string,
        systemPrompt: string,
        signal?: AbortSignal
    ): Promise<string> {
        if (await LocalProvider.checkAvailability() !== 'available') {
            throw new AIProviderError("Local AI is not available.");
        }

        // Clone the session for this specific request
        // This is lightweight and isolates context
        const session = await this.getSession(systemPrompt, signal);

        const startTime = Date.now();
        console.log(`[LocalProvider] [${new Date().toISOString()}] Sending prompt`);
        try {

            const response = await session.prompt(userPrompt, { signal });

            const totalDuration = Date.now() - startTime;
            console.log(`[LocalProvider] Prompt complete (took ${totalDuration}ms).`);

            // Note: The response might contain "Draft: ..." followed by JSON.
            // BaseProvider uses cleanAndParseJson which handles this.
            return response;
        } finally {
            // Always destroy the cloned session after use
            console.log(`[LocalProvider] [${new Date().toISOString()}] Destroying cloned session`);
            session.destroy();
        }
    }

    // Override generateSuggestions to implement Map-Reduce Batching
    async generateSuggestions(
        request: GroupingRequest
    ): Promise<SuggestionResult> {
        const { ungroupedTabs, existingGroups, customRules, signal } = request;

        // Batch configuration
        const BATCH_SIZE = 10;

        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();
        const errors: Error[] = [];
        let nextNewGroupId = -1;

        const systemPrompt = this.getSystemPrompt(customRules);

        // Chunk tabs
        const batches = [];
        for (let i = 0; i < ungroupedTabs.length; i += BATCH_SIZE) {
            batches.push(ungroupedTabs.slice(i, i + BATCH_SIZE));
        }

        console.log(`[LocalProvider] Processing ${ungroupedTabs.length} tabs in ${batches.length} batches (Size: ${BATCH_SIZE})`);

        const currentGroupNames = Array.from(groupNameMap.keys())
            .filter(name => name.trim().length > 0);

        const existingGroupsText = currentGroupNames.length > 0 ?
                "Existing Groups:\n" + currentGroupNames.map(name => `- "${name}"`).join('\n') : "";

        // Process batches sequentially to respect single-thread nature and simple concurrency management
        for (let i = 0; i < batches.length; i++) {
            const batchTabs = batches[i];
            console.log(`[LocalProvider] Processing batch ${i + 1}/${batches.length}`);

            const tabList = batchTabs
                .map(t => `- [ID: ${t.id}] Title: "${t.title}", URL: "${t.url}"`)
                .join('\n');

            const userPrompt = existingGroupsText + `\nUngrouped Tabs:\n${tabList}`;

            try {
                const responseText = await this.promptAI(userPrompt, systemPrompt, signal);
                const parsed = cleanAndParseJson(responseText);

                // Logic duplicated from BaseProvider but adapted for batch context if needed
                // Currently just reusing the same parsing logic
                 if (typeof parsed === 'object' && parsed !== null && 'groups' in parsed && Array.isArray((parsed as any).groups)) {
                    const groups = (parsed as any).groups;
                    for (const group of groups) {
                        const groupName = group.name;
                        const tabIds = group.ids || group.tab_ids;

                        if (Array.isArray(tabIds)) {
                            for (const tabId of tabIds) {
                                // Verify tabId exists in the *current batch* (or global, but strict check is good)
                                if (!batchTabs.find(t => t.id == tabId)) continue;

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
                } else {
                   // Fallback for other formats (though Local Prompt is strict)
                   // We can reuse the BaseProvider logic logic here by just copy-pasting or refactoring
                   // For now, I will implement the object iteration fallback
                    if (typeof parsed === 'object' && parsed !== null) {
                        for (const [groupName, tabIds] of Object.entries(parsed)) {
                            if (groupName === 'reasoning') continue;
                            if (Array.isArray(tabIds)) {
                                for (const tabId of tabIds) {
                                    if (!batchTabs.find(t => t.id == tabId)) continue;
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
                console.error(`[LocalProvider] Batch ${i + 1} failed`, error);
                errors.push(error);
            }
        }

        return {
            suggestions: Array.from(suggestions.values()),
            errors
        };
    }

    public static async downloadModel(onProgress: (e: ProgressEvent) => void) {
        // Create temporary session just to trigger download/check availability with progress monitoring
        const session = await LanguageModel.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            monitor(m) {
                m.addEventListener('downloadprogress', (e: ProgressEvent) => {
                    onProgress(e);
                });
            }
        });

        // We only needed it for the download/verification
        session.destroy();
    }
}
