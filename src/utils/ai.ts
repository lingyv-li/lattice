import { TabGroupSuggestion } from '../types/tabGrouper';

export interface GroupingContext {
    existingGroups: { id: number; title: string }[];
    ungroupedTabs: { id: number; title: string; url: string }[];
}

let cachedSession: any = null;

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
            I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".
            Your task is to organize the "Ungrouped Tabs".
            1. Prefer if an ungrouped tab fits well into an "Existing Group", assign it to that group.
            2. If a set of ungrouped tabs form a new topic, create a NEW group for them.
            3. Return ONLY a JSON object with a 'groups' key containing an array of objects.
            4. For new groups, use short, concise, and descriptive names (e.g., "News", "Dev", "Shopping"). Maximum 3 words.
            
            Each object in the array must have:
            - 'groupName' (string): Name of the group. If using an existing group, MUST match the existing group's title exactly.
            - 'tabIds' (array of numbers): The IDs of the ungrouped tabs to add to this group.
            - 'existingGroupId' (number | null): The ID of the existing group if adding to one, otherwise null.
            
            Do not include any markdown formatting or explanation.`
            }],
            monitor(m: any) {
                m.addEventListener('downloadprogress', (e: any) => {
                    const loaded = e.loaded || 0;
                    const total = e.total || 1;
                    onProgress(Math.round((loaded / total) * 100));
                    // Note: onProgress maps to INITIALIZING event
                });
            }
        });
    };

    // Initialize if needed
    if (!cachedSession) {
        cachedSession = await createSession();
    }
    onSessionCreated?.();

    const prompt = JSON.stringify({
        existingGroups: context.existingGroups,
        ungroupedTabs: context.ungroupedTabs
    });

    let response;
    try {
        // Try prompting with current session
        response = await cachedSession.prompt(prompt, {
            outputLanguage: 'en',
            responseConstraint: {
                type: 'json',
                schema: {
                    type: "object",
                    properties: {
                        groups: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    groupName: { type: "string" },
                                    tabIds: { type: "array", items: { type: "number" } },
                                    existingGroupId: { type: "number", nullable: true }
                                },
                                required: ["groupName", "tabIds"]
                            }
                        }
                    },
                    required: ["groups"]
                }
            }
        });
    } catch (err: any) {
        console.warn("Prompt failed with cached session, retrying with new session...", err);

        // Destroy old session if possible
        if (cachedSession && typeof cachedSession.destroy === 'function') {
            cachedSession.destroy();
        }
        cachedSession = null;

        // Create new and retry
        cachedSession = await createSession();
        onSessionCreated?.();

        try {
            // @ts-ignore
            response = await cachedSession.prompt(prompt, {
                outputLanguage: 'en',
                responseConstraint: {
                    type: 'json',
                    schema: {
                        type: "object",
                        properties: {
                            groups: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        groupName: { type: "string" },
                                        tabIds: { type: "array", items: { type: "number" } },
                                        existingGroupId: { type: "number", nullable: true }
                                    },
                                    required: ["groupName", "tabIds"]
                                }
                            }
                        },
                        required: ["groups"]
                    }
                }
            });
        } catch (constraintError) {
            // If constraint fails even on fresh session, fallback to text
            // @ts-ignore
            response = await cachedSession.prompt(prompt, { outputLanguage: 'en' });
        }
    }

    try {
        const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanResponse);
        return parsed.groups;
    } catch (e) {
        console.error("Failed to parse AI response", e);
        throw new Error("Failed to parse AI response.");
    }
};
