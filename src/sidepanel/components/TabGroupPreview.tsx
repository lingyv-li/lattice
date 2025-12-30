import { Check } from 'lucide-react';
import { TabGroupSuggestion } from '../../hooks/useTabGrouper';

interface TabGroupPreviewProps {
    previewGroups: (TabGroupSuggestion & { existingGroupId?: number | null })[];
    selectedPreviewIndices: Set<number>;
    tabDataMap: Map<number, { title: string, url: string }>;
    onToggleSelection: (idx: number) => void;
    onApply?: () => void;
    onCancel?: () => void;
}

export const TabGroupPreview = ({
    previewGroups,
    selectedPreviewIndices,
    tabDataMap,
    onToggleSelection
}: TabGroupPreviewProps) => {
    return (
        <div className="mb-4 space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase">Preview Suggestions</h4>
            {previewGroups.map((group, idx) => (
                <div
                    key={idx}
                    onClick={() => onToggleSelection(idx)}
                    className={`p-[var(--spacing-list-padding)] rounded-lg border cursor-pointer transition-all duration-200 ${selectedPreviewIndices.has(idx)
                        ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800'
                        : 'bg-surface border-border-subtle hover:bg-surface-dim'
                        }`}
                >
                    <div className="flex items-start gap-[var(--spacing-item-gap)] mb-0.5">
                        <div className="pt-0.5">
                            <div className={`flex items-center justify-center size-[var(--size-icon-sm)] rounded transition-colors ${selectedPreviewIndices.has(idx)
                                ? 'bg-btn-primary-bg text-btn-primary-fg'
                                : 'border border-border-strong bg-surface'
                                }`}>
                                {selectedPreviewIndices.has(idx) && <Check className="size-3" strokeWidth={3} />}
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-[var(--spacing-item-gap)] mb-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${group.existingGroupId
                                    ? 'bg-status-info-bg text-status-info-fg'
                                    : 'bg-status-neutral-bg text-status-neutral-fg'
                                    }`}>
                                    {group.existingGroupId ? 'Merge' : 'New'}
                                </span>
                                <span className="text-sm font-medium text-main">{group.groupName}</span>
                            </div>
                            <div className="pl-2 border-l-2 border-border-subtle text-xs text-muted space-y-1">
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
        </div>
    );
};
