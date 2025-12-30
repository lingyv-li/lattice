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
        cleanMissing,
        cleanInterrupted,
        setCleanMissing,
        setCleanInterrupted,
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
            {totalFound} potential
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
                <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        {/* Missing Files Toggle */}
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setCleanMissing(!cleanMissing);
                            }}
                            className={`
                                relative py-2 px-3 rounded-lg border transition-all duration-200 cursor-pointer group select-none flex items-center justify-between
                                ${cleanMissing
                                    ? 'bg-purple-500/5 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                                    : 'bg-surface border-border-strong hover:bg-surface-highlight hover:border-border-subtle'
                                }
                            `}
                        >
                            <span className={`text-[10px] uppercase font-bold tracking-wider ${cleanMissing ? 'text-purple-600' : 'text-muted'}`}>
                                Missing Files
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${cleanMissing ? 'text-main' : 'text-muted'}`}>
                                    {missingItems.length}
                                </span>
                                {cleanMissing && <CheckCircle className="w-3.5 h-3.5 text-purple-500" />}
                            </div>
                        </div>

                        {/* Interrupted Toggle */}
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setCleanInterrupted(!cleanInterrupted);
                            }}
                            className={`
                                relative py-2 px-3 rounded-lg border transition-all duration-200 cursor-pointer group select-none flex items-center justify-between
                                ${cleanInterrupted
                                    ? 'bg-purple-500/5 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                                    : 'bg-surface border-border-strong hover:bg-surface-highlight hover:border-border-subtle'
                                }
                            `}
                        >
                            <span className={`text-[10px] uppercase font-bold tracking-wider ${cleanInterrupted ? 'text-purple-600' : 'text-muted'}`}>
                                Interrupted Downloads
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${cleanInterrupted ? 'text-main' : 'text-muted'}`}>
                                    {interruptedItems.length}
                                </span>
                                {cleanInterrupted && <CheckCircle className="w-3.5 h-3.5 text-purple-500" />}
                            </div>
                        </div>
                    </div>

                    {(!cleanMissing && !cleanInterrupted) && (
                        <div className="flex items-center justify-center py-1.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                            <span className="text-[10px] font-medium">
                                Select at least one category to clean
                            </span>
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
