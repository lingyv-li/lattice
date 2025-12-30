import { AIProvider, GroupingRequest } from './types';
import { TabGroupSuggestion } from '../../types/tabGrouper';
import { handleAssignment, cleanAndParseJson, constructSystemPrompt } from './shared';

// Define types for the Local AI API (flaky spec)
interface NanoSession {
    prompt(text: string): Promise<string>;
    destroy(): void;
}

interface NanoFactory {
    create(options?: { initialPrompts?: { role: string, content: string }[] }): Promise<NanoSession>;
}

declare global {
    interface Window {
        ai: {
            languageModel: NanoFactory;
        };
    }
    // Fallback for older/alternative implementations
    // var LanguageModel: NanoFactory; // Commenting out to avoid duplicate identifier error if already defined
}


export class LocalProvider implements AIProvider {
    id = 'local';

    // Static cache to persist session across multiple calls/instantiations
    private static cachedSession: NanoSession | null = null;
    private static cachedRules: string | null = null;

    // For testing purposes only
    static reset() {
        this.cachedSession = null;
        this.cachedRules = null;
    }

    constructor(
        private customRules: string = ""
    ) { }

    async generateSuggestions(
        request: GroupingRequest,
        onProgress: (progress: number) => void
    ): Promise<TabGroupSuggestion[]> {
        const { ungroupedTabs, existingGroups } = request;
        const groupNameMap = existingGroups;
        const suggestions = new Map<string, TabGroupSuggestion>();
        let nextNewGroupId = -1;

        // Initialize Local Session if needed
        await this.ensureLocalSession(this.customRules);

        if (!LocalProvider.cachedSession) {
            throw new Error("Failed to initialize Local AI session.");
        }

        const totalTabs = ungroupedTabs.length;
        let processedCount = 0;

        for (const tab of ungroupedTabs) {
            const currentGroupNames = Array.from(groupNameMap.keys()).filter(name => name.trim().length > 0);

            let prompt = `
    Existing Groups:
    ${currentGroupNames.map(name => `- ${name}`).join('\n')}
    
    Ungrouped Tab:
    Title: ${tab.title}
    URL: ${tab.url}
            `.trim();

            try {
                const responseText = await LocalProvider.cachedSession.prompt(prompt);
                const parsed = cleanAndParseJson(responseText);

                // Parsed should be { groupName: string }
                if (parsed.groupName) {
                    nextNewGroupId = handleAssignment(
                        parsed.groupName,
                        tab.id,
                        groupNameMap,
                        suggestions,
                        nextNewGroupId
                    );
                }

            } catch (e) {
                console.error("Failed to process tab with Local AI", tab.title, e);
            }

            processedCount++;
            onProgress(Math.round((processedCount / totalTabs) * 100));
        }

        return Array.from(suggestions.values());
    }

    private async ensureLocalSession(customRules: string) {
        // Reset if rules changed
        if (LocalProvider.cachedSession && LocalProvider.cachedRules !== customRules) {
            LocalProvider.cachedSession.destroy();
            LocalProvider.cachedSession = null;
        }

        if (!LocalProvider.cachedSession) {
            const systemPrompt = constructSystemPrompt(customRules, false);

            const factory = self.ai?.languageModel || self.LanguageModel;
            if (!factory) {
                throw new Error("AI API not supported in this browser.");
            }

            LocalProvider.cachedSession = await factory.create({
                initialPrompts: [{
                    role: "system",
                    content: systemPrompt
                }]
            });
            LocalProvider.cachedRules = customRules;
        }
    }
}
