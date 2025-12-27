import { useState } from 'react';
import { Sparkles, Layers, AlertCircle, Loader2 } from 'lucide-react';

interface TabGroupSuggestion {
    groupName: string;
    tabIds: number[];
}

export const TabGrouper = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [previewGroups, setPreviewGroups] = useState<(TabGroupSuggestion & { existingGroupId?: number | null })[] | null>(null);
    const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<Set<number>>(new Set());
    const [tabDataMap, setTabDataMap] = useState<Map<number, { title: string, url: string }>>(new Map());

    const generateGroups = async () => {
        setLoading(true);
        setError(null);
        setSuccess(false);
        setDownloadProgress(null);
        setPreviewGroups(null);

        try {
            if (!("LanguageModel" in window)) {
                throw new Error("AI API not supported in this browser.");
            }

            const availability = await window.LanguageModel.availability();
            if (availability === 'no') {
                throw new Error("AI model is not available.");
            }

            const allTabs = await chrome.tabs.query({ currentWindow: true });

            // Fetch existing groups
            const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
            const existingGroupsData = existingGroups.map(g => ({ id: g.id, title: g.title || `Group ${g.id}` }));

            // Filter for ungrouped tabs (groupId === -1)
            const ungroupedTabs = allTabs.filter(t => t.groupId === chrome.tabs.TAB_ID_NONE);
            const tabData = ungroupedTabs
                .filter(t => t.id && t.url && t.title)
                .map(t => ({ id: t.id, title: t.title, url: t.url }));

            if (tabData.length === 0) {
                throw new Error("No ungrouped tabs found.");
            }

            // Store tab data for preview
            const map = new Map();
            tabData.forEach(t => map.set(t.id, t));
            setTabDataMap(map);

            const session = await window.LanguageModel.create({
                initialPrompts: [{
                    role: "system",
                    content: `You are a browser tab organizer. 
                    I will provide a list of "Existing Groups" and a list of "Ungrouped Tabs".
                    Your task is to organize the "Ungrouped Tabs".
                    1. If an ungrouped tab fits well into an "Existing Group", assign it to that group.
                    2. If a set of ungrouped tabs form a new topic, create a NEW group for them.
                    3. Return ONLY a JSON object with a 'groups' key containing an array of objects.
                    
                    Each object in the array must have:
                    - 'groupName' (string): Name of the group. If using an existing group, MUST match the existing group's title exactly.
                    - 'tabIds' (array of numbers): The IDs of the ungrouped tabs to add to this group.
                    - 'existingGroupId' (number | null): The ID of the existing group if adding to one, otherwise null.
                    
                    Do not include any markdown formatting or explanation.`
                }],
                expectedInputs: [{ type: 'text', languages: ['en'] }],
                expectedOutputs: [{ type: 'text', languages: ['en'] }],
                monitor(m) {
                    m.addEventListener('downloadprogress', (e: any) => {
                        const loaded = e.loaded || 0;
                        const total = e.total || 1;
                        setDownloadProgress(Math.round((loaded / total) * 100));
                    });
                }
            });

            setDownloadProgress(null); // Download complete (if any), now processing

            const prompt = JSON.stringify({
                existingGroups: existingGroupsData,
                ungroupedTabs: tabData
            });

            const response = await session.prompt(prompt);

            console.log("AI Response:", response);

            // Clean up code blocks if present
            const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();

            let groups: { groups: (TabGroupSuggestion & { existingGroupId?: number | null })[] };
            try {
                groups = JSON.parse(cleanResponse);
                setPreviewGroups(groups.groups);
                // Select all by default
                setSelectedPreviewIndices(new Set(groups.groups.map((_, i) => i)));
            } catch (e) {
                console.error("Failed to parse AI response", e);
                console.log("Raw response", response);
                throw new Error("Failed to parse AI response.");
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || "An error occurred while grouping tabs.");
        } finally {
            setLoading(false);
            setDownloadProgress(null);
        }
    };

    const applyGroups = async () => {
        if (!previewGroups) return;
        setLoading(true);

        try {
            for (let i = 0; i < previewGroups.length; i++) {
                if (!selectedPreviewIndices.has(i)) continue;

                const group = previewGroups[i];
                if (group.tabIds.length > 0) {
                    const validTabIds = group.tabIds.filter(id => tabDataMap.has(id));

                    if (validTabIds.length > 0) {
                        if (group.existingGroupId) {
                            // Add to existing group
                            await chrome.tabs.group({
                                tabIds: validTabIds as [number, ...number[]],
                                groupId: group.existingGroupId
                            });
                        } else {
                            // Create new group
                            const groupId = await chrome.tabs.group({ tabIds: validTabIds as [number, ...number[]] });
                            await chrome.tabGroups.update(groupId, { title: group.groupName });
                        }
                    }
                }
            }
            setSuccess(true);
            setPreviewGroups(null);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message || "Failed to apply groups.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">AI Tab Grouper</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
                Automatically organize your open tabs into groups using on-device AI.
            </p>

            {error && (
                <div className="mb-3 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {previewGroups && (
                <div className="mb-4 space-y-3">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase">Preview Suggestions</h4>
                    {previewGroups.map((group, idx) => (
                        <div key={idx} className="bg-white dark:bg-zinc-800 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
                            <div className="flex items-start gap-3 mb-2">
                                <div className="pt-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedPreviewIndices.has(idx)}
                                        onChange={() => {
                                            const newSet = new Set(selectedPreviewIndices);
                                            if (newSet.has(idx)) {
                                                newSet.delete(idx);
                                            } else {
                                                newSet.add(idx);
                                            }
                                            setSelectedPreviewIndices(newSet);
                                        }}
                                        className="w-4 h-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-zinc-700 dark:text-zinc-300">
                                            {group.existingGroupId ? 'Merge' : 'New'}
                                        </span>
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{group.groupName}</span>
                                    </div>
                                    <div className="pl-2 border-l-2 border-zinc-100 dark:border-zinc-700 text-xs text-zinc-500 space-y-1">
                                        {group.tabIds.map(tid => {
                                            const t = tabDataMap.get(tid);
                                            return t ? (
                                                <div key={tid} className="line-clamp-1 opacity-80">• {t.title}</div>
                                            ) : null;
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={() => setPreviewGroups(null)}
                            className="flex-1 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={applyGroups}
                            className="flex-1 py-2 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        >
                            Apply Groups
                        </button>
                    </div>
                </div>
            )}

            {!previewGroups && (
                <button
                    onClick={generateGroups}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                    {downloadProgress !== null ?
                        `Downloading Model ${downloadProgress}%` :
                        (loading ? "Organizing Tabs..." : (success ? "Tabs Grouped!" : "Group Tabs Now"))
                    }
                </button>
            )}
        </div>
    );
};
