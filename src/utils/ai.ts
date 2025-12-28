import { TabGroupSuggestion, GroupingContext } from '../types/tabGrouper';
import { getSettings } from './storage';
import { generateContentGemini } from './gemini';

let cachedSession: LanguageModel | null = null;
let cachedRules: string | null = null;

export const generateTabGroupSuggestions = async (
    context: GroupingContext,
    onProgress: (progress: number) => void,
    onSessionCreated?: () => void
): Promise<TabGroupSuggestion[]> => {

    // 0. Fetch settings
    let appSettings = await getSettings();
    let { customGroupingRules, aiProvider, geminiApiKey, aiModel } = appSettings;
    customGroupingRules = customGroupingRules || "";

    // Validation for Local
    if (aiProvider !== 'gemini' && !self.LanguageModel) {
        throw new Error("AI API not supported in this browser.");
    }

    // Helper to Create Session (Local)
    const createLocalSession = async () => {
        let systemPrompt = `You are a browser tab organizer. 
            I will provide a list of "Existing Groups" and a SINGLE "Ungrouped Tab".
            Your task is to assign the "Ungrouped Tab" to a group.
            
            Rules:
            1. STRICTLY PREFER "Existing Groups". If the tab fits an existing group, you MUST use that EXACT name.
            2. Only create a NEW group name if the tab clearly does NOT fit any existing group.
            3. Use short, concise names for new groups (max 3 words).
            
            Return a JSON object with:
            - 'groupName' (string): The name of the group.
            
            Do not include any markdown formatting or explanation.`;

        if (customGroupingRules.trim().length > 0) {
            systemPrompt += `\n\nAdditional Rules:\n${customGroupingRules}`;
        }

        const session = await self.LanguageModel.create({
            initialPrompts: [{
                role: "system",
                content: systemPrompt
            }]
        });

        cachedRules = customGroupingRules;
        return session;
    };

    // Initialize Local Session logic
    if (aiProvider !== 'gemini') {
        if (!cachedSession || cachedRules !== customGroupingRules) {
            if (cachedSession) {
                cachedSession.destroy();
            }
            cachedSession = await createLocalSession();
            onSessionCreated?.();
        }
    }


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
    let nextNewGroupId = -1;
    const totalTabs = context.ungroupedTabs.length;
    let processedCount = 0;

    // --- Branch: Gemini (Batch Processing) ---
    if (aiProvider === 'gemini') {
        if (!geminiApiKey) throw new Error("API Key is missing for Gemini Cloud.");

        const BATCH_SIZE = 10;
        const batches = [];
        for (let i = 0; i < totalTabs; i += BATCH_SIZE) {
            batches.push(context.ungroupedTabs.slice(i, i + BATCH_SIZE));
        }

        for (const batch of batches) {
            const currentGroupNames = Array.from(groupNameMap.keys()).filter(name => name.trim().length > 0);

            // Construct Batch Prompt
            const tabList = batch.map(t => `- [ID: ${t.id}] Title: ${t.title}, URL: ${t.url}`).join('\n');

            const systemPrompt = `You are a browser tab organizer. 
            I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".
            Your task is to assign EACH "Ungrouped Tab" to a group.

            Rules:
            1. STRICTLY PREFER "Existing Groups". If the tab fits an existing group, you MUST use that EXACT name.
            2. Only create a NEW group name if the tab clearly does NOT fit any existing group.
            3. Use short, concise names for new groups (max 3 words).
            4. Return a JSON object containing a list called "assignments".
            5. Each assignment must have:
               - "tabId" (number): The ID provided in the input.
               - "groupName" (string): The assigned group name.
            ${customGroupingRules ? `\nAdditional Rules:\n${customGroupingRules}` : ''}`;

            const userPrompt = `
Existing Groups:
${currentGroupNames.map(name => `- ${name}`).join('\n')}

Ungrouped Tabs:
${tabList}
            `.trim();

            try {
                const responseText = await generateContentGemini(geminiApiKey, aiModel, systemPrompt, userPrompt);

                const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanResponse);

                if (parsed.assignments && Array.isArray(parsed.assignments)) {
                    for (const assignment of parsed.assignments) {
                        const { tabId, groupName } = assignment;

                        // Find tab object to verify ID exists (security check)
                        if (!batch.find(t => t.id === tabId)) continue;

                        let targetGroupId: number;
                        if (groupNameMap.has(groupName)) {
                            targetGroupId = groupNameMap.get(groupName)!;
                        } else if (groupName && groupName.trim().length > 0) {
                            targetGroupId = nextNewGroupId--;
                            groupNameMap.set(groupName, targetGroupId);
                        } else {
                            targetGroupId = nextNewGroupId--;
                        }

                        const key = `group-id-${targetGroupId}`;
                        if (!suggestions.has(key)) {
                            suggestions.set(key, {
                                groupName: groupName,
                                tabIds: [],
                                existingGroupId: targetGroupId >= 0 ? targetGroupId : null
                            });
                        }
                        suggestions.get(key)!.tabIds.push(tabId);
                    }
                }
            } catch (err) {
                console.error("Batch prompt failed", err);
                // Continue to next batch, treating these as failed
            }

            processedCount += batch.length;
            onProgress(Math.round((processedCount / totalTabs) * 100));
        }

        return Array.from(suggestions.values());
    }

    // --- Branch: Local (Sequential Processing) ---
    // Helper for Prompt Execution
    const executePromptLocal = async (prompt: string): Promise<string> => {
        return await cachedSession!.prompt(prompt);
    }

    for (const tab of context.ungroupedTabs) {
        const currentGroupNames = Array.from(groupNameMap.keys()).filter(name => name.trim().length > 0);

        let prompt = `
Existing Groups:
${currentGroupNames.map(name => `- ${name}`).join('\n')}

Ungrouped Tab:
Title: ${tab.title}
URL: ${tab.url}
`.trim();

        let responseText;
        try {
            responseText = await executePromptLocal(prompt);
        } catch (err: unknown) {
            console.error("Prompt failed", err);
            // Don't kill the whole process, just skip this tab
            processedCount++;
            onProgress(Math.round((processedCount / totalTabs) * 100));
            continue;
        }

        try {
            const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);
            const groupName = parsed.groupName;

            let targetGroupId: number;

            // Determine Group ID
            if (groupNameMap.has(groupName)) {
                targetGroupId = groupNameMap.get(groupName)!;
            } else if (groupName && groupName.trim().length > 0) {
                // New group! Assign a new negative ID and add to map for future tabs
                targetGroupId = nextNewGroupId--;
                groupNameMap.set(groupName, targetGroupId);
            } else {
                // Fallback for empty/invalid group name from AI - treat as isolated new group but don't add to map
                targetGroupId = nextNewGroupId--;
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
            console.error("Failed to parse response for tab", tab.title, e);
        }

        processedCount++;
        onProgress(Math.round((processedCount / totalTabs) * 100));
    }

    return Array.from(suggestions.values());
};
