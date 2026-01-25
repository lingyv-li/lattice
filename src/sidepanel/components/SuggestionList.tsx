
import React, { useMemo, useCallback } from 'react';
import { Group, Trash2, Sparkles, Loader2, LucideIcon } from 'lucide-react';
import { useTabGrouper } from '../../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../../hooks/useDuplicateCleaner';
import { SuggestionItem } from './SuggestionItem';
import { SuggestionType, SuggestionTab } from '../../types/suggestions';

interface UnifiedSuggestion {
    id: string;
    type: SuggestionType;
    title: string;
    description: string;
    icon: LucideIcon;
    onClick: () => Promise<void>;
    tabs: SuggestionTab[];
}

export const SuggestionList: React.FC = () => {
    const { previewGroups, snapshot, applyGroup, isBackgroundProcessing } = useTabGrouper();
    const { duplicateGroups, closeDuplicateGroup } = useDuplicateCleaner();
    const [processingId, setProcessingId] = React.useState<string | null>(null);
    const [isAcceptingAll, setIsAcceptingAll] = React.useState(false);

    // Stable handler to prevent function recreation on every render
    const handleAction = useCallback(async (id: string, action: () => Promise<void>) => {
        if (processingId || isAcceptingAll) return;
        setProcessingId(id);
        try {
            await action();
        } finally {
            setProcessingId(null);
        }
    }, [processingId, isAcceptingAll]);

    // optimize: Memoize the suggestion list construction to avoid re-mapping tabs on every render
    const suggestions = useMemo(() => {
        const list: UnifiedSuggestion[] = [];

        // 1. Duplicate Suggestions
        duplicateGroups.forEach((tabs, url) => {
            if (tabs.length > 1) {
                const countToRemove = tabs.length - 1;
                // Use title of the first tab (original) for better context
                const displayTitle = tabs[0].title || new URL(url).hostname;

                const id = `dedup-${url}`;

                // Show only the tabs that will be closed (duplicates), not the original
                const duplicateTabs = tabs.slice(1);

                list.push({
                    id,
                    type: SuggestionType.Deduplicate,
                    title: `Clean "${displayTitle}"`,
                    description: `Close ${countToRemove} duplicate tab${countToRemove > 1 ? 's' : ''}`,
                    icon: Trash2,
                    onClick: async () => closeDuplicateGroup(url),
                    tabs: duplicateTabs.map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }))
                });
            }
        });

        // 2. Grouping Suggestions
        if (previewGroups) {
            previewGroups.forEach((group, index) => {
                const isExisting = !!group.existingGroupId;
                const tabCount = group.tabIds.length;
                const id = `group-${index}-${group.groupName}`;

                // Resolve tab objects from snapshot
                const groupTabs = group.tabIds
                    .map(tid => snapshot?.getTabData(tid))
                    .filter((t): t is chrome.tabs.Tab => !!t);

                list.push({
                    id,
                    type: SuggestionType.Group,
                    title: isExisting ? `Add to "${group.groupName}"` : `Group "${group.groupName}"`,
                    description: `Organize ${tabCount} tab${tabCount > 1 ? 's' : ''}`,
                    icon: Group,
                    onClick: async () => applyGroup(index),
                    tabs: groupTabs.map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }))
                });
            });
        }

        return list;
    }, [previewGroups, duplicateGroups, snapshot, applyGroup, closeDuplicateGroup]);

    // Stable callback wrapper that looks up the action by ID, maintaining referential stability for child components
    const handleItemAction = useCallback((id: string) => {
        const item = suggestions.find(s => s.id === id);
        if (item) {
            handleAction(id, item.onClick);
        }
    }, [suggestions, handleAction]);

    const handleAcceptAll = async () => {
        setIsAcceptingAll(true);
        try {
            // Sequential execution for stability
            for (const item of suggestions) {
                setProcessingId(item.id);
                try {
                    await item.onClick();
                    // Small delay to allow state updates/animations
                    await new Promise(r => setTimeout(r, 200));
                } catch (e) {
                    console.error("Failed to apply suggestion", item.title, e);
                }
            }
        } finally {
            setProcessingId(null);
            setIsAcceptingAll(false);
        }
    };

    // Empty State Handling
    if (suggestions.length === 0) {
        if (isBackgroundProcessing) {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-center h-full animate-pulse">
                    <div className="w-12 h-12 bg-surface-highlight rounded-full flex items-center justify-center mb-4">
                        <Loader2 className="w-6 h-6 text-action animate-spin" />
                    </div>
                    <h3 className="text-main font-medium mb-1">Scanning Tabs...</h3>
                    <p className="text-muted text-sm">Looking for ways to organize your workspace.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <div className="w-12 h-12 bg-surface-highlight rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 text-muted" />
                </div>
                <h3 className="text-main font-medium mb-1">All Caught Up</h3>
                <p className="text-muted text-sm">No organization suggestions at the moment.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-3">
            {/* Accept All Button */}
            {suggestions.length > 1 && (
                <button
                    onClick={handleAcceptAll}
                    disabled={isAcceptingAll || processingId !== null}
                    className="w-full py-2 px-4 bg-btn-primary-bg text-btn-primary-fg font-medium rounded-lg hover:bg-btn-primary-hover active:scale-95 transition-all text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-2"
                >
                    {isAcceptingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span>Accept All ({suggestions.length})</span>
                </button>
            )}

            {suggestions.map(item => (
                <SuggestionItem
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    type={item.type}
                    onAction={handleItemAction}
                    isLoading={processingId === item.id}
                    disabled={(processingId !== null && processingId !== item.id) || isAcceptingAll}
                    tabs={item.tabs}
                />
            ))}
        </div>
    );
};
