import { CopyMinus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDuplicateCleaner } from '../../hooks/useDuplicateCleaner';
import { OrganizerStatus } from '../../types/organizer';
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

    const badge = status === OrganizerStatus.Success ? (
        <span className="text-xs font-medium text-status-success-fg bg-status-success-bg px-2 py-0.5 rounded-full">
            Cleaned
        </span>
    ) : duplicateCount > 0 ? (
        <span className="text-xs font-medium text-status-warning-fg bg-status-warning-bg px-2 py-0.5 rounded-full">
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
            disabled={status === OrganizerStatus.Applying}
            autopilot={{
                enabled: autopilotEnabled,
                onToggle: onAutopilotToggle
            }}
        >
            {/* Content Area - minimal or just details */}
            {status === OrganizerStatus.Applying ? (
                <div className="flex items-center gap-2 text-xs text-muted mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Cleaning...</span>
                </div>
            ) : status === OrganizerStatus.Success ? (
                <div className="flex items-center gap-2 text-xs text-status-success-fg mt-2">
                    <CheckCircle className="w-3 h-3" />
                    <span>Closed {closedCount} tabs</span>
                </div>
            ) : status === OrganizerStatus.Error ? (
                <div className="flex items-center gap-2 text-xs text-status-error-fg mt-2">
                    <AlertCircle className="w-3 h-3" />
                    <span>Error cleaning duplicates</span>
                </div>
            ) :
                duplicateCount > 0 && (
                    <div className="mt-2 text-xs text-muted">
                        Ready to close {duplicateCount} duplicate {duplicateCount === 1 ? 'tab' : 'tabs'}.
                    </div>
                )
            }
        </SelectionCard>
    );
};
