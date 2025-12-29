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

    // 1. Prepare Group Name Map
    const groupNameMap = mapExistingGroups(context.existingGroups);
    const suggestions = new Map<string, TabGroupSuggestion>();
    let nextNewGroupId = -1;

    // 2. Dispatch to Provider
    if (aiProvider === 'gemini') {
        if (!geminiApiKey) throw new Error("API Key is missing for Gemini Cloud.");

        await processWithGemini(
            context.ungroupedTabs,
            geminiApiKey,
            aiModel,
            customGroupingRules,
            groupNameMap,
            suggestions,
            (newId) => nextNewGroupId = newId,
            nextNewGroupId,
            onProgress
        );
    } else {
        // Initialize Local Session if needed
        await ensureLocalSession(customGroupingRules, onSessionCreated);

        await processWithLocal(
            context.ungroupedTabs,
            groupNameMap,
            suggestions,
            (newId) => nextNewGroupId = newId,
            nextNewGroupId,
            onProgress
        );
    }

    return Array.from(suggestions.values());
};

// --- Helpers ---

// Helper: Map Existing Groups
const mapExistingGroups = (groups: { id: number, title?: string }[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const group of groups) {
        if (group.title && group.title.trim().length > 0) {
            if (!map.has(group.title)) {
                map.set(group.title, group.id);
            }
        }
    }
    return map;
};

// Helper: Ensure Local Session
const ensureLocalSession = async (customRules: string, onCreated?: () => void) => {
    if (!cachedSession || cachedRules !== customRules) {
        if (cachedSession) {
            cachedSession.destroy();
        }

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

        if (customRules.trim().length > 0) {
            systemPrompt += `\n\nAdditional Rules:\n${customRules}`;
        }

        cachedSession = await self.LanguageModel.create({
            initialPrompts: [{
                role: "system",
                content: systemPrompt
            }]
        });

        cachedRules = customRules;
        onCreated?.();
    }
};

// Helper: Process with Gemini (Batching)
const processWithGemini = async (
    tabs: { id: number, title: string, url: string }[],
    apiKey: string,
    model: string,
    customRules: string,
    groupMap: Map<string, number>,
    suggestions: Map<string, TabGroupSuggestion>,
    updateNextId: (id: number) => void,
    currentNextId: number,
    onProgress: (p: number) => void
) => {
    const totalTabs = tabs.length;
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < totalTabs; i += BATCH_SIZE) {
        batches.push(tabs.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    let nextId = currentNextId;

    for (const batch of batches) {
        const currentGroupNames = Array.from(groupMap.keys()).filter(name => name.trim().length > 0);

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
        ${customRules ? `\nAdditional Rules:\n${customRules}` : ''}`;

        const userPrompt = `
Existing Groups:
${currentGroupNames.map(name => `- ${name}`).join('\n')}

Ungrouped Tabs:
${tabList}
        `.trim();

        try {
            const responseText = await generateContentGemini(apiKey, model, systemPrompt, userPrompt);
            const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);

            if (parsed.assignments && Array.isArray(parsed.assignments)) {
                for (const assignment of parsed.assignments) {
                    const { tabId, groupName } = assignment;
                    if (!batch.find(t => t.id === tabId)) continue;

                    nextId = handleAssignment(groupName, tabId, groupMap, suggestions, nextId);
                }
            }
        } catch (err) {
            console.error("Batch prompt failed", err);
        }

        processedCount += batch.length;
        onProgress(Math.round((processedCount / totalTabs) * 100));
    }
    updateNextId(nextId);
};

// Helper: Process with Local (Sequential)
const processWithLocal = async (
    tabs: { id: number, title: string, url: string }[],
    groupMap: Map<string, number>,
    suggestions: Map<string, TabGroupSuggestion>,
    updateNextId: (id: number) => void,
    currentNextId: number,
    onProgress: (p: number) => void
) => {
    const totalTabs = tabs.length;
    let processedCount = 0;
    let nextId = currentNextId;

    for (const tab of tabs) {
        const currentGroupNames = Array.from(groupMap.keys()).filter(name => name.trim().length > 0);

        let prompt = `
Existing Groups:
${currentGroupNames.map(name => `- ${name}`).join('\n')}

Ungrouped Tab:
Title: ${tab.title}
URL: ${tab.url}
`.trim();

        try {
            const responseText = await cachedSession!.prompt(prompt);
            const cleanResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanResponse);

            nextId = handleAssignment(parsed.groupName, tab.id, groupMap, suggestions, nextId);

        } catch (e) {
            console.error("Failed to process tab", tab.title, e);
        }

        processedCount++;
        onProgress(Math.round((processedCount / totalTabs) * 100));
    }
    updateNextId(nextId);
};

// Helper: Common Assignment Logic
const handleAssignment = (
    groupName: string,
    tabId: number,
    groupMap: Map<string, number>,
    suggestions: Map<string, TabGroupSuggestion>,
    currentNextId: number
): number => {
    let targetGroupId: number;
    let updatedNextId = currentNextId;

    if (groupMap.has(groupName)) {
        targetGroupId = groupMap.get(groupName)!;
    } else if (groupName && groupName.trim().length > 0) {
        targetGroupId = updatedNextId--;
        groupMap.set(groupName, targetGroupId);
    } else {
        targetGroupId = updatedNextId--;
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

    return updatedNextId;
};
