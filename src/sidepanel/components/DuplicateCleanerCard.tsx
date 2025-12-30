import { CopyMinus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDuplicateCleaner } from '../../hooks/useDuplicateCleaner';
import { SelectionCard } from './SelectionCard';

interface DuplicateCleanerCardProps {
    isSelected: boolean;
    onToggle: () => void;
    // We pass the hook result from the parent to avoid double-invocation if needed,
    // or we can just use the hook here and expose the status to the parent?
    // Better to let the parent manage the hook so it can trigger the action.
    data: ReturnType<typeof useDuplicateCleaner>;
    autopilotEnabled: boolean;
    onAutopilotToggle: (enabled: boolean) => void;
}

export const DuplicateCleanerCard = ({ isSelected, onToggle, data, autopilotEnabled, onAutopilotToggle }: DuplicateCleanerCardProps) => {
    const { status, closedCount, duplicateCount } = data;

    const badge = status === 'success' ? (
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            Cleaned
        </span>
    ) : duplicateCount > 0 ? (
        <span className="text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {duplicateCount} found
        </span>
    ) : (
        <span className="text-xs font-medium text-muted bg-surface-highlight px-2 py-0.5 rounded-full">
            No duplicates
        </span>
    );

    return (
        <SelectionCard
            isSelected={isSelected}
            onToggle={onToggle}
            title="Duplicate Tabs"
            icon={CopyMinus}
            description="Close tabs that are exact duplicates of others."
            badge={badge}
            disabled={status === 'cleaning'}
            autopilot={{
                enabled: autopilotEnabled,
                onToggle: onAutopilotToggle
            }}
        >
            {/* Content Area - minimal or just details */}
            {status === 'cleaning' ? (
                <div className="flex items-center gap-2 text-xs text-muted mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Cleaning...</span>
                </div>
            ) : status === 'success' ? (
                <div className="flex items-center gap-2 text-xs text-green-600 mt-2">
                    <CheckCircle className="w-3 h-3" />
                    <span>Closed {closedCount} tabs</span>
                </div>
            ) : status === 'error' ? (
                <div className="flex items-center gap-2 text-xs text-red-600 mt-2">
                    <AlertCircle className="w-3 h-3" />
                    <span>Error cleaning duplicates</span>
                </div>
            ) : (
                <div className="mt-2 text-xs text-muted">
                    {duplicateCount > 0
                        ? `Ready to close ${duplicateCount} duplicate ${duplicateCount === 1 ? 'tab' : 'tabs'}.`
                        : "Everything looks clean!"}
                </div>
            )}
        </SelectionCard>
    );
};
