import { Trash2, Loader2, CheckCircle } from 'lucide-react';
import { useDownloadCleaner } from '../../hooks/useDownloadCleaner';
import { SelectionCard } from './SelectionCard';

interface DownloadCleanerCardProps {
    isSelected: boolean;
    onToggle: () => void;
    data: ReturnType<typeof useDownloadCleaner>;
}

export const DownloadCleanerCard = ({ isSelected, onToggle, data }: DownloadCleanerCardProps) => {
    const {
        missingItems,
        interruptedItems,
        loading,
        cleaning,
        done
    } = data;

    const totalFound = missingItems.length + interruptedItems.length;

    const badge = done ? (
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
            Cleaned
        </span>
    ) : totalFound > 0 ? (
        <span className="text-xs font-medium text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {totalFound} found
        </span>
    ) : (
        <span className="text-xs font-medium text-muted bg-surface-highlight px-2 py-0.5 rounded-full">
            Clean
        </span>
    );

    return (
        <SelectionCard
            isSelected={isSelected}
            onToggle={onToggle}
            title="Download Cleaner"
            icon={Trash2}
            description="Remove missing files and interrupted downloads from history."
            badge={badge}
            disabled={loading || cleaning}
        >
            {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Scanning downloads...</span>
                </div>
            ) : cleaning ? (
                <div className="flex items-center gap-2 text-xs text-muted mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Cleaning...</span>
                </div>
            ) : done ? (
                <div className="flex items-center gap-2 text-xs text-green-600 mt-2">
                    <CheckCircle className="w-3 h-3" />
                    <span>History cleaned!</span>
                </div>
            ) : totalFound > 0 ? (
                <div className="mt-2 space-y-1">
                    {missingItems.length > 0 && (
                        <div className="text-xs text-muted flex justify-between">
                            <span>Missing files:</span>
                            <span className="font-medium text-main">{missingItems.length}</span>
                        </div>
                    )}
                    {interruptedItems.length > 0 && (
                        <div className="text-xs text-muted flex justify-between">
                            <span>Interrupted:</span>
                            <span className="font-medium text-main">{interruptedItems.length}</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="mt-2 text-xs text-muted">
                    Your download history is clean.
                </div>
            )}
        </SelectionCard>
    );
};
