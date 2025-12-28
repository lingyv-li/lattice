import { CopyMinus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';

export const DuplicateTabCleaner = () => {
    const { status, closedCount, duplicateCount, closeDuplicates } = useDuplicateCleaner();

    // If no duplicates and idle, check if we simply hide or show "All good"
    // User request: "show the button only when there are duplicate tabs"
    // We will keep the card visible to show the tool exists, but maybe just text if clean.

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <CopyMinus className={`w-5 h-5 ${duplicateCount > 0 ? 'text-orange-500' : 'text-zinc-400'}`} />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Duplicate Cleaner</h3>
            </div>

            <p className="text-xs text-zinc-500 mb-4">
                {duplicateCount > 0
                    ? `Found ${duplicateCount} duplicate ${duplicateCount === 1 ? 'tab' : 'tabs'}.`
                    : "No duplicate tabs found."}
            </p>

            {(duplicateCount > 0 || status === 'success' || status === 'cleaning') && (
                <button
                    onClick={closeDuplicates}
                    disabled={status === 'cleaning'}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 
                        ${status === 'success'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                        } disabled:opacity-50`}
                >
                    {status === 'cleaning' ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Cleaning...</span>
                        </>
                    ) : status === 'success' ? (
                        <>
                            <CheckCircle className="w-4 h-4" />
                            <span>{closedCount > 0 ? `Closed ${closedCount} tabs` : 'Cleaned!'}</span>
                        </>
                    ) : status === 'error' ? (
                        <>
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <span>Error</span>
                        </>
                    ) : (
                        <>
                            <span>Close {duplicateCount} Duplicates</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
};
