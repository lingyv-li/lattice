import { TabGroupSuggestion, GroupingContext } from '../types/tabGrouper';

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
            I will provide a list of "Existing Group Names" and a SINGLE "Ungrouped Tab".
            Your task is to assign the "Ungrouped Tab" to a group.
            
            Rules:
            1. Check if the tab fits well into one of the "Existing Group Names". If so, use that EXACT name.
            2. If it doesn't fit an existing group, assign it to a NEW group name based on its topic.
            3. Use short, concise names for new groups (max 3 words).
            
            Return a JSON object with:
            - 'groupName' (string): The name of the group.
            
            Do not include any markdown formatting or explanation.`
            }]
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
                groupName: { type: "string" }
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

    // 1. Build a deterministic map of "Group Name" -> "Group ID"
    // We only care about the FIRST group with a given name
    const groupNameMap = new Map<string, number>();

    // Filter out empty names and populate map
    for (const group of context.existingGroups) {
        if (group.title && group.title.trim().length > 0) {
            if (!groupNameMap.has(group.title)) {
                groupNameMap.set(group.title, group.id);
            }
        }
    }

    const suggestions = new Map<string, TabGroupSuggestion>();

    // We use negative IDs for new groups to allow referencing them in subsequent prompts
    let nextNewGroupId = -1;

    const totalTabs = context.ungroupedTabs.length;
    let processedCount = 0;

    for (const tab of context.ungroupedTabs) {
        const currentGroupNames = Array.from(groupNameMap.keys());

        const prompt = JSON.stringify({
            existingGroupNames: currentGroupNames,
            ungroupedTab: {
                title: tab.title,
                url: tab.url
            }
        });

        let response;
        try {
            response = await executePrompt(cachedSession!, prompt);
        } catch (err: unknown) {
            console.error("Prompt failed", err);
            throw err;
        }

        try {
            const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);
            const groupName = parsed.groupName;

            let targetGroupId: number;

            // Determine Group ID
            if (groupNameMap.has(groupName)) {
                targetGroupId = groupNameMap.get(groupName)!;
            } else {
                // New group! Assign a new negative ID and add to map for future tabs
                targetGroupId = nextNewGroupId--;
                groupNameMap.set(groupName, targetGroupId);
            }

            // Group suggestions by their target ID (to handle merging into same new/existing group)
            const key = `group-id-${targetGroupId}`;

            if (!suggestions.has(key)) {
                suggestions.set(key, {
                    groupName: groupName,
                    tabIds: [],
                    existingGroupId: targetGroupId >= 0 ? targetGroupId : null
                });
            }

            const suggestion = suggestions.get(key)!;
            suggestion.tabIds.push(tab.id);

        } catch (e) {
            console.error("Failed to parse response for tab", tab.id, e);
        }

        processedCount++;
        onProgress(Math.round((processedCount / totalTabs) * 100));
    }

    // Convert map to array
    return Array.from(suggestions.values());
};
