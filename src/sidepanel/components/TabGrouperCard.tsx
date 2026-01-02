import { Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { useTabGrouper } from '../../hooks/useTabGrouper';
import { OrganizerStatus } from '../../types/organizer';
import { TabGroupPreview } from './TabGroupPreview';
import { SelectionCard } from './SelectionCard';

interface TabGrouperCardProps {
    isSelected: boolean;
    onToggle: () => void;
    // We pass the hooks/data down
    data: ReturnType<typeof useTabGrouper>;
    autopilotEnabled: boolean;
    onAutopilotToggle: (enabled: boolean) => void;
}

export const TabGrouperCard = ({ isSelected, onToggle, data, autopilotEnabled, onAutopilotToggle }: TabGrouperCardProps) => {
    const {
        status,
        error,
        previewGroups,
        selectedPreviewIndices,
        snapshot,
        isBackgroundProcessing,
        toggleGroupSelection,
        aiEnabled,
        regenerateSuggestions,
    } = data;

    const ungroupedCount = snapshot?.tabCount ?? 0;

    // AI Disabled State
    if (!aiEnabled) {
        return (
            <SelectionCard
                isSelected={false}
                onToggle={onToggle}
                title="AI Tab Grouper"
                icon={Sparkles}
                description="AI grouping is currently disabled."
                disabled={true}
                badge={<span className="text-xs font-medium text-muted bg-surface-highlight px-2 py-0.5 rounded-full">Disabled</span>}
            >
                <div className="mt-2 text-xs text-muted flex flex-col gap-2">
                    <p>Select an AI provider in Settings to enable this feature.</p>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            chrome.runtime.openOptionsPage();
                        }}
                        className="text-blue-500 hover:text-blue-600 underline font-medium self-start"
                    >
                        Open Settings
                    </button>
                </div>
            </SelectionCard>
        );
    }

    const badge = status === OrganizerStatus.Success ? (
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            Done
        </span>
    ) : previewGroups ? (
        <span className="text-xs font-medium text-purple-600 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
            Review
        </span>
    ) : ungroupedCount > 0 ? (
        <span className="text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {ungroupedCount} ungrouped
        </span>
    ) : (
        <span className="text-xs font-medium text-muted bg-surface-highlight px-2 py-0.5 rounded-full">
            Organized
        </span>
    );

    const isLoading = status === OrganizerStatus.Applying;

    // Determine card title and processing state
    let cardTitle = "AI Tab Grouper";
    let isProcessingState = false;

    if (status === OrganizerStatus.Applying) {
        cardTitle = "Grouping Tabs...";
        isProcessingState = true;
    } else if (isBackgroundProcessing && !previewGroups) {
        cardTitle = "Analyzing Tabs...";
        isProcessingState = true;
    }

    return (
        <SelectionCard
            isSelected={isSelected}
            onToggle={onToggle}
            title={cardTitle}
            icon={isProcessingState ? Loader2 : Sparkles}
            spinIcon={isProcessingState}
            description="Automatically organize open tabs into groups."
            badge={badge}
            autopilot={{
                enabled: autopilotEnabled,
                onToggle: onAutopilotToggle
            }}
        >
            {/* Error State */}
            {error && (
                <div className="mb-3 p-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Preview UI - shown when groups are generated but not applied yet */}
            {previewGroups && snapshot && (
                <div className="mt-2">
                    <TabGroupPreview
                        previewGroups={previewGroups}
                        selectedPreviewIndices={selectedPreviewIndices}
                        snapshot={snapshot}
                        onToggleSelection={toggleGroupSelection}
                        onRegenerate={regenerateSuggestions}
                    />
                </div>
            )}


            {/* Content when ready/idle */}
            {!previewGroups && !isLoading && ungroupedCount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-muted">
                        Ready to organize {ungroupedCount} tabs.
                    </div>
                </div>
            )}


        </SelectionCard>
    );
};
