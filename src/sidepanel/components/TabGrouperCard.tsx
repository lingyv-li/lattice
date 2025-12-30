import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useTabGrouper } from '../../hooks/useTabGrouper';
import { TabGroupPreview } from './TabGroupPreview';
import { SelectionCard } from './SelectionCard';

interface TabGrouperCardProps {
    isSelected: boolean;
    onToggle: () => void;
    // We pass the hooks/data down
    data: ReturnType<typeof useTabGrouper>;
}

export const TabGrouperCard = ({ isSelected, onToggle, data }: TabGrouperCardProps) => {
    const {
        status,
        error,
        progress,
        previewGroups,
        selectedPreviewIndices,
        tabDataMap,
        ungroupedCount,
        isBackgroundProcessing,
        // Actions
        toggleGroupSelection,
    } = data;

    const badge = status === 'success' ? (
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            Done
        </span>
    ) : previewGroups ? (
        <span className="text-xs font-medium text-purple-600 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
            Review
        </span>
    ) : (ungroupedCount ?? 0) > 0 ? (
        <span className="text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {ungroupedCount} ungrouped
        </span>
    ) : (
        <span className="text-xs font-medium text-muted bg-surface-highlight px-2 py-0.5 rounded-full">
            Organized
        </span>
    );

    const isLoading = status === 'processing' || status === 'initializing';

    return (
        <SelectionCard
            isSelected={isSelected}
            onToggle={onToggle}
            title="AI Tab Grouper"
            icon={Sparkles}
            description="Automatically organize open tabs into groups."
            badge={badge}
        >
            {/* Error State */}
            {error && (
                <div className="mb-3 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Background Processing Indicator (when card logic itself isn't 'processing' but background is) */}
            {isBackgroundProcessing && !isLoading && !previewGroups && (
                <div className="mb-2 text-xs text-muted flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                    Analyzing tabs available...
                </div>
            )}

            {/* Preview UI - shown when groups are generated but not applied yet */}
            {previewGroups && (
                <div className="mt-2">
                    <TabGroupPreview
                        previewGroups={previewGroups}
                        selectedPreviewIndices={selectedPreviewIndices}
                        tabDataMap={tabDataMap}
                        onToggleSelection={toggleGroupSelection}
                    />
                </div>
            )}

            {/* Content when ready/idle */}
            {!previewGroups && !isLoading && (ungroupedCount ?? 0) > 0 && (
                <div className="mt-2 text-xs text-muted">
                    Ready to organize {ungroupedCount} tabs.
                </div>
            )}

            {/* Progress Bar (if processing) */}
            {status === 'processing' && progress !== null && (
                <div className="mt-2 w-full bg-border-subtle rounded-full h-1.5 overflow-hidden">
                    <div
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </SelectionCard>
    );
};
