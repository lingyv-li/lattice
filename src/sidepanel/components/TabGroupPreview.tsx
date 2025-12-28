import { X } from 'lucide-react';
import { TabGroupSuggestion } from '../../hooks/useTabGrouper';

interface TabGroupPreviewProps {
    previewGroups: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    selectedPreviewIndices: Set<number>;
    tabDataMap: Map<number, { title: string, url: string }>;
    onToggleSelection: (idx: number) => void;
    onReject: (idx: number) => void;
    onApply: () => void;
    onCancel: () => void;
}

export const TabGroupPreview = ({
    previewGroups,
    selectedPreviewIndices,
    tabDataMap,
    onToggleSelection,
    onReject,
    onApply,
    onCancel
}: TabGroupPreviewProps) => {
    return (
        <div className="mb-4 space-y-3">
            <h4 className="text-xs font-bold text-zinc-500 uppercase">Preview Suggestions</h4>
            {previewGroups.map((group, idx) => (
                <div
                    key={idx}
                    onClick={() => onToggleSelection(idx)}
                    className="bg-white dark:bg-zinc-800 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                >
                    <div className="flex items-start gap-3 mb-2">
                        <div className="pt-1">
                            <input
                                type="checkbox"
                                checked={selectedPreviewIndices.has(idx)}
                                readOnly
                                className="w-5 h-5 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 pointer-events-none"
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
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReject(idx);
                            }}
                            className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Reject this suggestion"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
            <div className="sticky bottom-0 z-10 flex gap-2 -mx-4 -mb-4 px-4 py-3 mt-4 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 rounded-b-xl backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                    Dismiss All
                </button>
                <button
                    onClick={onApply}
                    className="flex-1 py-2 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 shadow-sm"
                >
                    Apply Groups
                </button>
            </div>
        </div>
    );
};
