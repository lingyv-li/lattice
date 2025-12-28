import { CopyMinus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useDuplicateCleaner } from '../hooks/useDuplicateCleaner';

export const DuplicateTabCleaner = () => {
    const { status, closedCount, duplicateCount, closeDuplicates } = useDuplicateCleaner();

    // Show "clean" state when no duplicates
    if (duplicateCount === 0 && status !== 'cleaning') {
        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
                <div className="flex items-center gap-2 mb-2">
                    <CopyMinus className="w-5 h-5 text-zinc-400" />
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Duplicate Cleaner</h3>
                </div>
                <div className="flex flex-col items-center justify-center py-4 text-center">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-zinc-500 text-xs">No duplicates!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <CopyMinus className={`w-5 h-5 ${duplicateCount > 0 ? 'text-orange-500' : 'text-zinc-400'}`} />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Duplicate Cleaner</h3>
            </div>

            <p className="text-xs text-zinc-500 mb-4">
                {`Found ${duplicateCount} duplicate ${duplicateCount === 1 ? 'tab' : 'tabs'}.`}
            </p>

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
        </div>
    );
};
