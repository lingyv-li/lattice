import { Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { CleanableItem } from '../../hooks/useDownloadCleaner';

interface CleanerSummaryProps {
    missingItems: CleanableItem[];
    interruptedItems: CleanableItem[];
    cleanMissing: boolean;
    setCleanMissing: (value: boolean) => void;
    cleanInterrupted: boolean;
    setCleanInterrupted: (value: boolean) => void;
    onDetails: () => void;
    onClean: () => void;
    cleaning: boolean;
}

export const CleanerSummary = ({
    missingItems,
    interruptedItems,
    cleanMissing,
    setCleanMissing,
    cleanInterrupted,
    setCleanInterrupted,
    onDetails,
    onClean,
    cleaning
}: CleanerSummaryProps) => {
    const totalFound = missingItems.length + interruptedItems.length;
    const selectedCount = (cleanMissing ? missingItems.length : 0) + (cleanInterrupted ? interruptedItems.length : 0);

    return (
        <div className="p-4 bg-surface-dim rounded-xl border border-border-subtle mb-4 relative">
            <div className="flex items-center gap-2 mb-2">
                <Trash2 className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm text-main">Download Cleaner</h3>
                {selectedCount > 0 && (
                    <span className="ml-auto bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
                        {selectedCount} issues
                    </span>
                )}
            </div>

            <p className="text-xs text-muted mb-4">
                Found {totalFound} useless files taking up space in your download history.
            </p>

            <div className="flex gap-2 w-full text-xs font-medium mb-4">
                <button
                    onClick={() => missingItems.length > 0 && setCleanMissing(!cleanMissing)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${cleanMissing
                        ? 'bg-surface border-border-subtle text-main shadow-sm'
                        : 'bg-transparent border-transparent text-muted hover:bg-surface-dim'
                        } ${missingItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {cleanMissing && <CheckCircle className="w-3 h-3 text-blue-500" />}
                    {missingItems.length} Missing
                </button>

                <button
                    onClick={() => interruptedItems.length > 0 && setCleanInterrupted(!cleanInterrupted)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${cleanInterrupted
                        ? 'bg-surface border-border-subtle text-main shadow-sm'
                        : 'bg-transparent border-transparent text-muted hover:bg-surface-dim'
                        } ${interruptedItems.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                    {cleanInterrupted && <CheckCircle className="w-3 h-3 text-blue-500" />}
                    {interruptedItems.length} Failed
                </button>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onDetails}
                    className="py-2 px-3 rounded-lg font-medium text-muted hover:bg-border-subtle transition-colors text-xs"
                >
                    Details
                </button>
                <button
                    onClick={onClean}
                    disabled={cleaning || selectedCount === 0}
                    className="flex-1 py-2 px-4 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale text-sm"
                >
                    {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clean Selected'}
                </button>
            </div>
        </div>
    );
};
