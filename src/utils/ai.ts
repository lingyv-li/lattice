import { TabGroupSuggestion } from '../types/tabGrouper';

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}

let cachedSession: LanguageModel | null = null;

export const generateTabGroupSuggestions = async (
    context: GroupingContext,
    onProgress: (progress: number) => void,
    onSessionCreated?: () => void
): Promise<TabGroupSuggestion[]> => {
    if (!self.LanguageModel) {
        throw new Error("AI API not supported in this browser.");
    }

    // Helper to create session
    const createSession = async () => {
        return await self.LanguageModel.create({
            initialPrompts: [{
                role: "system",
                content: `You are a browser tab organizer. 
            I will provide a list of "Existing Groups" and a SINGLE "Ungrouped Tab".
            Your task is to assign the "Ungrouped Tab" to a group.
            
            Rules:
            1. Check if the tab fits well into an "Existing Group". If so, assign it there.
            2. If it doesn't fit an existing group, assign it to a NEW group name based on its topic.
            3. Use short, concise names for new groups (max 3 words).
            
            Return a JSON object with:
            - 'groupName' (string): The name of the group.
            - 'existingGroupId' (number | null): The ID of the existing group if used, otherwise null.
            
            Do not include any markdown formatting or explanation.`
            }]
            // Note: We removed the download monitor here because onProgress is now used for task progress.
        });
    };

    // Initialize if needed
    if (!cachedSession) {
        cachedSession = await createSession();
    }
    onSessionCreated?.();

    // Helper to execute prompt with options
    const executePrompt = async (session: LanguageModel, prompt: string, useSchema = false) => {
        const outputSchema = {
            type: "object",
            properties: {
                groupName: { type: "string" },
                existingGroupId: { type: "number", nullable: true }
            },
            required: ["groupName"]
        };

        const options: LanguageModelPromptOptions = useSchema ? {
            responseConstraint: {
                type: 'json',
                schema: outputSchema
            }
        } : {};

        return await session.prompt(prompt, options);
    };

    // Dynamic state
    const currentGroups = [...context.existingGroups];
    const suggestions = new Map<string, TabGroupSuggestion>();

    // We use negative IDs for new groups to allow referencing them in subsequent prompts
    let nextNewGroupId = -1;

    const totalTabs = context.ungroupedTabs.length;
    let processedCount = 0;

    for (const tab of context.ungroupedTabs) {
        const prompt = JSON.stringify({
            existingGroups: currentGroups,
            ungroupedTab: {
                title: tab.title,
                url: tab.url
            }
        });

        let response;
        try {
            response = await executePrompt(cachedSession!, prompt);
        } catch (err: any) {
            console.error("Prompt failed", err);
            throw err;
        }

        try {
            const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);

            const groupName = parsed.groupName;
            let existingGroupId = parsed.existingGroupId;

            // Update dynamic groups if it's a new group
            if (!existingGroupId) {
                // Check if we already created a pending group with this name
                const alreadyProposed = currentGroups.find(g => g.title === groupName && g.id < 0);
                if (alreadyProposed) {
                    existingGroupId = alreadyProposed.id;
                } else {
                    // It is truly new
                    existingGroupId = nextNewGroupId--;
                    currentGroups.push({ id: existingGroupId, title: groupName });
                }
            }

            // Add to suggestions map
            // We key by the "current effective ID" (which might be negative) to group them
            const key = `group-${existingGroupId}`;

            if (!suggestions.has(key)) {
                suggestions.set(key, {
                    groupName: groupName,
                    tabIds: [],
                    existingGroupId: existingGroupId >= 0 ? existingGroupId : null // Only return real IDs to the caller? 
                    // Actually, the caller probably expects existingGroupId to be a real chrome group ID.
                    // If it's null, the caller will create a new group. 
                    // So we should map negative IDs back to null for the final result.
                });
            }

            const suggestion = suggestions.get(key)!;
            suggestion.tabIds.push(tab.id);

        } catch (e) {
            console.error("Failed to parse response for tab", tab.id, e);
            // Optionally continue or fail? We'll continue and leave this tab ungrouped.
        }

        processedCount++;
        onProgress(Math.round((processedCount / totalTabs) * 100));
    }

    // Convert map to array and cleanup
    return Array.from(suggestions.values());
};
